import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { atomicWriteJson } from "../../src/lib/jobs/persistence.ts";
import { computeAggregate } from "../../src/lib/github/aggregate.ts";
import {
  buildGithubRefreshResult,
  computeRepoFetchSince,
  zeroChangeRepoOutcome,
  type RepoFetchOutcome,
} from "../../src/lib/github/refresh-run.ts";
import {
  defaultGithubArtifactPaths,
  publishGithubRefresh,
} from "../../src/lib/github/persistence.ts";
import {
  appendRefreshLogRow,
  refreshLogStatus,
} from "../../src/lib/github/refresh-log.ts";
import { buildGithubSummaryMarkdown } from "../../src/lib/github/summary.ts";
import { GITHUB_INDEX_VERSION } from "../../src/lib/github/schema.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempProfileDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "refine-cv-github-"));
  tempDirs.push(dir);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function basePrior(repo: string) {
  return {
    repo,
    description: "desc",
    topics: ["react"],
    defaultBranch: "main",
    pushedAt: "2026-07-01T00:00:00Z",
    languages: { TypeScript: 1000 },
    commits: [
      {
        sha: "keep-me",
        subject: "Existing commit",
        date: "2026-07-01T10:00:00Z",
        author: "Dev",
      },
    ],
    pullRequests: [
      {
        number: 9,
        title: "Existing PR",
        state: "merged",
        created_at: "2026-06-01T10:00:00Z",
        merged_at: "2026-06-02T10:00:00Z",
        labels: "",
      },
    ],
    inferredThemes: ["react"],
    completeness: {
      commitsHistoryComplete: true,
      pullRequestsHistoryComplete: true,
      commitsTruncatedThisRun: false,
      pullRequestsTruncatedThisRun: false,
    },
    watermark: {
      lastIndexedAt: "2026-07-19T10:00:00Z",
      latestCommitSha: "keep-me",
      latestCommitDate: "2026-07-01T10:00:00Z",
      overlapSeconds: 3600,
    },
  };
}

describe("github refresh run", () => {
  it("merges two consecutive incremental runs without losing history", () => {
    const priorIndex = {
      version: GITHUB_INDEX_VERSION as const,
      snapshotAt: "2026-07-19T10:00:00Z",
      indexScope: "author-full-history" as const,
      authorIdentity: { githubLogins: ["dev"], commitNames: ["Dev"] },
      selectedRepos: ["org/app"],
      repos: [basePrior("org/app")],
      aggregate: computeAggregate([basePrior("org/app")]),
    };

    const firstRun: RepoFetchOutcome = {
      ok: true,
      repo: "org/app",
      fetchMode: "incremental",
      description: "updated",
      topics: ["react"],
      defaultBranch: "main",
      pushedAt: "2026-07-20T00:00:00Z",
      languages: { TypeScript: 1200 },
      fetchedCommits: [
        {
          sha: "new-one",
          subject: "New commit",
          date: "2026-07-20T09:00:00Z",
          author: "Dev",
        },
      ],
      fetchedPullRequests: [],
      commitsFetchedThisRun: 1,
      pullRequestsFetchedThisRun: 0,
      commitsTruncatedThisRun: false,
      pullRequestsTruncatedThisRun: false,
    };

    const first = buildGithubRefreshResult({
      runAt: "2026-07-20T10:00:00Z",
      selectedRepos: ["org/app"],
      authorIdentity: priorIndex.authorIdentity,
      priorIndex,
      priorIndexState: {
        version: 1,
        lastFullIndexAt: "2026-07-19T10:00:00Z",
        repos: {
          "org/app": {
            lastIndexedAt: "2026-07-19T10:00:00Z",
            latestCommitSha: "keep-me",
          },
        },
      },
      outcomes: [firstRun],
      commitLimit: 0,
      prLimit: 0,
      includePullRequests: true,
    });

    expect(first.index.repos[0]?.commits).toHaveLength(2);
    expect(first.delta.aggregateDelta.commitsAdded).toBe(1);

    const second = buildGithubRefreshResult({
      runAt: "2026-07-21T10:00:00Z",
      selectedRepos: ["org/app"],
      authorIdentity: priorIndex.authorIdentity,
      priorIndex: first.index,
      priorIndexState: first.indexState,
      outcomes: [zeroChangeRepoOutcome("org/app", "incremental")],
      commitLimit: 0,
      prLimit: 0,
      includePullRequests: true,
    });

    expect(second.index.repos[0]?.commits).toHaveLength(2);
    expect(second.delta.aggregateDelta.commitsAdded).toBe(0);
    expect(second.index.aggregate.totalCommits).toBe(2);
  });

  it("retains prior snapshot on repo failure", () => {
    const prior = basePrior("org/app");
    const result = buildGithubRefreshResult({
      runAt: "2026-07-20T10:00:00Z",
      selectedRepos: ["org/app"],
      authorIdentity: { githubLogins: ["dev"], commitNames: ["Dev"] },
      priorIndex: {
        version: GITHUB_INDEX_VERSION,
        snapshotAt: "2026-07-19T10:00:00Z",
        indexScope: "author-full-history",
        authorIdentity: { githubLogins: ["dev"], commitNames: ["Dev"] },
        selectedRepos: ["org/app"],
        repos: [prior],
        aggregate: computeAggregate([prior]),
      },
      priorIndexState: {
        version: 1,
        lastFullIndexAt: "2026-07-19T10:00:00Z",
        repos: {
          "org/app": {
            lastIndexedAt: "2026-07-19T10:00:00Z",
            latestCommitSha: "keep-me",
          },
        },
      },
      outcomes: [{ ok: false, repo: "org/app", error: "403 Forbidden" }],
      commitLimit: 0,
      prLimit: 0,
      includePullRequests: true,
    });

    expect(result.index.repos[0]?.commits).toHaveLength(1);
    expect(result.indexState.repos["org/app"]?.lastIndexedAt).toBe(
      "2026-07-19T10:00:00Z",
    );
    expect(result.indexState.lastFullIndexAt).toBe("2026-07-19T10:00:00Z");
    expect(result.delta.reposFailed).toHaveLength(1);
    expect(refreshLogStatus(result.delta)).toBe("failed");
  });

  it("does not advance watermark when fetch truncates", () => {
    const prior = basePrior("org/app");
    const result = buildGithubRefreshResult({
      runAt: "2026-07-20T10:00:00Z",
      selectedRepos: ["org/app"],
      authorIdentity: { githubLogins: ["dev"], commitNames: ["Dev"] },
      priorIndex: {
        version: GITHUB_INDEX_VERSION,
        snapshotAt: "2026-07-19T10:00:00Z",
        indexScope: "author-full-history",
        authorIdentity: { githubLogins: ["dev"], commitNames: ["Dev"] },
        selectedRepos: ["org/app"],
        repos: [prior],
        aggregate: computeAggregate([prior]),
      },
      priorIndexState: {
        version: 1,
        lastFullIndexAt: "2026-07-19T10:00:00Z",
        repos: {
          "org/app": {
            lastIndexedAt: "2026-07-19T10:00:00Z",
            latestCommitSha: "keep-me",
          },
        },
      },
      outcomes: [
        {
          ok: true,
          repo: "org/app",
          fetchMode: "incremental",
          description: "",
          topics: [],
          defaultBranch: "main",
          pushedAt: "",
          languages: {},
          fetchedCommits: [
            {
              sha: "new",
              subject: "x",
              date: "2026-07-20T09:00:00Z",
              author: "Dev",
            },
          ],
          fetchedPullRequests: [],
          commitsFetchedThisRun: 1,
          pullRequestsFetchedThisRun: 0,
          commitsTruncatedThisRun: true,
          pullRequestsTruncatedThisRun: false,
        },
      ],
      commitLimit: 1,
      prLimit: 0,
      includePullRequests: true,
    });

    expect(result.index.repos[0]?.completeness.commitsHistoryComplete).toBe(false);
    expect(result.indexState.repos["org/app"]?.lastIndexedAt).toBe(
      "2026-07-19T10:00:00Z",
    );
    expect(result.index.repos[0]?.watermark.lastIndexedAt).toBe(
      "2026-07-19T10:00:00Z",
    );
    expect(result.indexState.lastFullIndexAt).toBe("2026-07-19T10:00:00Z");
    expect(result.delta.diagnostics.warnings[0]).toContain(
      "Set maxCommitsPerRepo and maxPullRequestsPerRepo to 0",
    );
  });

  it("keeps capped first-run incomplete and preserves watermark when limit not hit", () => {
    const result = buildGithubRefreshResult({
      runAt: "2026-07-20T10:00:00Z",
      selectedRepos: ["org/app"],
      authorIdentity: { githubLogins: ["dev"], commitNames: ["Dev"] },
      priorIndex: null,
      priorIndexState: { version: 1, lastFullIndexAt: null, repos: {} },
      outcomes: [
        {
          ok: true,
          repo: "org/app",
          fetchMode: "first-run",
          description: "app",
          topics: [],
          defaultBranch: "main",
          pushedAt: "2026-07-20T00:00:00Z",
          languages: { TypeScript: 1000 },
          fetchedCommits: [
            {
              sha: "only-few",
              subject: "Initial",
              date: "2026-07-01T10:00:00Z",
              author: "Dev",
            },
          ],
          fetchedPullRequests: [],
          commitsFetchedThisRun: 1,
          pullRequestsFetchedThisRun: 0,
          commitsTruncatedThisRun: false,
          pullRequestsTruncatedThisRun: false,
        },
      ],
      commitLimit: 100,
      prLimit: 0,
      includePullRequests: true,
    });

    expect(result.index.repos[0]?.completeness.commitsHistoryComplete).toBe(false);
    expect(result.index.repos[0]?.watermark.lastIndexedAt).toBe("");
    expect(result.indexState.repos["org/app"]).toBeUndefined();
    expect(result.indexState.lastFullIndexAt).toBeNull();
    expect(result.delta.diagnostics.warnings[0]).toContain(
      "Set maxCommitsPerRepo and maxPullRequestsPerRepo to 0",
    );
  });

  it("prefers committed state and advances lastFullIndexAt only for a complete run", () => {
    const prior = basePrior("org/app");
    expect(
      computeRepoFetchSince(
        {
          ...prior,
          watermark: {
            ...prior.watermark,
            lastIndexedAt: "2026-07-20T10:00:00Z",
          },
        },
        {
          version: 1,
          lastFullIndexAt: "2026-07-19T10:00:00Z",
          repos: {
            "org/app": {
              lastIndexedAt: "2026-07-19T10:00:00Z",
              latestCommitSha: "keep-me",
            },
          },
        },
        "org/app",
      ),
    ).toBe("2026-07-19T09:00:00.000Z");

    const complete = buildGithubRefreshResult({
      runAt: "2026-07-20T10:00:00Z",
      selectedRepos: ["org/app"],
      authorIdentity: { githubLogins: ["dev"], commitNames: ["Dev"] },
      priorIndex: {
        version: GITHUB_INDEX_VERSION,
        snapshotAt: "2026-07-19T10:00:00Z",
        indexScope: "author-full-history",
        authorIdentity: { githubLogins: ["dev"], commitNames: ["Dev"] },
        selectedRepos: ["org/app"],
        repos: [prior],
        aggregate: computeAggregate([prior]),
      },
      priorIndexState: {
        version: 1,
        lastFullIndexAt: "2026-07-19T10:00:00Z",
        repos: {},
      },
      outcomes: [zeroChangeRepoOutcome("org/app", "incremental")],
      commitLimit: 0,
      prLimit: 0,
      includePullRequests: true,
    });
    expect(complete.indexState.lastFullIndexAt).toBe("2026-07-20T10:00:00Z");
  });

  it("recomputes aggregate languages once per repo", () => {
    const repoA = basePrior("org/a");
    const repoB = {
      ...basePrior("org/b"),
      languages: { TypeScript: 500 },
    };
    const result = buildGithubRefreshResult({
      runAt: "2026-07-20T10:00:00Z",
      selectedRepos: ["org/a", "org/b"],
      authorIdentity: { githubLogins: ["dev"], commitNames: ["Dev"] },
      priorIndex: {
        version: GITHUB_INDEX_VERSION,
        snapshotAt: "2026-07-19T10:00:00Z",
        indexScope: "author-full-history",
        authorIdentity: { githubLogins: ["dev"], commitNames: ["Dev"] },
        selectedRepos: ["org/a", "org/b"],
        repos: [repoA, repoB],
        aggregate: computeAggregate([repoA, repoB]),
      },
      priorIndexState: { version: 1, lastFullIndexAt: null, repos: {} },
      outcomes: [
        {
          ...zeroChangeRepoOutcome("org/a", "incremental"),
          languages: { TypeScript: 1000 },
        },
        {
          ...zeroChangeRepoOutcome("org/b", "incremental"),
          languages: { TypeScript: 500 },
        },
      ],
      commitLimit: 0,
      prLimit: 0,
      includePullRequests: true,
    });

    expect(result.index.aggregate.languages.TypeScript).toBe(1500);
    expect(result.index.aggregate.totalCommits).toBe(2);
  });

  it("dedupes overlap commits idempotently", () => {
    const prior = basePrior("org/app");
    const overlapCommit = prior.commits[0]!;
    const first = buildGithubRefreshResult({
      runAt: "2026-07-20T10:00:00Z",
      selectedRepos: ["org/app"],
      authorIdentity: { githubLogins: ["dev"], commitNames: ["Dev"] },
      priorIndex: {
        version: GITHUB_INDEX_VERSION,
        snapshotAt: "2026-07-19T10:00:00Z",
        indexScope: "author-full-history",
        authorIdentity: { githubLogins: ["dev"], commitNames: ["Dev"] },
        selectedRepos: ["org/app"],
        repos: [prior],
        aggregate: computeAggregate([prior]),
      },
      priorIndexState: { version: 1, lastFullIndexAt: null, repos: {} },
      outcomes: [
        {
          ok: true,
          repo: "org/app",
          fetchMode: "incremental",
          description: "desc",
          topics: [],
          defaultBranch: "main",
          pushedAt: "",
          languages: { TypeScript: 1000 },
          fetchedCommits: [overlapCommit],
          fetchedPullRequests: [],
          commitsFetchedThisRun: 1,
          pullRequestsFetchedThisRun: 0,
          commitsTruncatedThisRun: false,
          pullRequestsTruncatedThisRun: false,
        },
      ],
      commitLimit: 0,
      prLimit: 0,
      includePullRequests: true,
    });

    expect(first.delta.aggregateDelta.commitsAdded).toBe(0);
    expect(first.index.repos[0]?.commits).toHaveLength(1);
  });
});

describe("github artifact persistence", () => {
  it("keeps prior watermarks when index-state write fails", () => {
    const profileDir = makeTempProfileDir();
    const artifactPaths = defaultGithubArtifactPaths(profileDir);
    const priorState = {
      version: 1 as const,
      lastFullIndexAt: "2026-07-19T10:00:00Z",
      repos: {
        "org/app": {
          lastIndexedAt: "2026-07-19T10:00:00Z",
          latestCommitSha: "keep-me",
        },
      },
    };
    atomicWriteJson(artifactPaths.indexState, priorState, { backup: false });

    const index = {
      version: GITHUB_INDEX_VERSION as const,
      snapshotAt: "2026-07-20T10:00:00Z",
      indexScope: "author-full-history" as const,
      authorIdentity: { githubLogins: ["dev"], commitNames: ["Dev"] },
      selectedRepos: ["org/app"],
      repos: [basePrior("org/app")],
      aggregate: computeAggregate([basePrior("org/app")]),
    };

    const delta = {
      version: 1 as const,
      runAt: "2026-07-20T10:00:00Z",
      reposAttempted: ["org/app"],
      reposSucceeded: ["org/app"],
      reposFailed: [],
      perRepo: {},
      aggregateDelta: {
        commitsAdded: 0,
        commitsUpdated: 0,
        pullRequestsAdded: 0,
        pullRequestsUpdated: 0,
      },
      diagnostics: { watermarkOverlapSeconds: 3600, warnings: [] },
    };

    const writeAtomicJson = vi.fn(
      (targetPath: string, value: unknown, options?: { backup?: boolean }) => {
        if (targetPath.endsWith("index-state.json")) {
          throw new Error("simulated state write failure");
        }
        atomicWriteJson(targetPath, value, options);
      },
    );

    expect(() =>
      publishGithubRefresh({
        paths: artifactPaths,
        index,
        summaryMarkdown: "# summary",
        delta,
        refreshLogMarkdown: appendRefreshLogRow("", delta, "success"),
        indexState: {
          version: 1,
          lastFullIndexAt: "2026-07-20T10:00:00Z",
          repos: {
            "org/app": {
              lastIndexedAt: "2026-07-20T10:00:00Z",
              latestCommitSha: "new",
            },
          },
        },
        writeAtomicJson,
      }),
    ).toThrow("simulated state write failure");

    const persisted = JSON.parse(
      readFileSync(artifactPaths.indexState, "utf8"),
    ) as typeof priorState;
    expect(persisted.repos["org/app"]?.lastIndexedAt).toBe("2026-07-19T10:00:00Z");
    expect(existsSync(artifactPaths.githubIndex)).toBe(true);
  });
});

describe("github summary escaping", () => {
  it("escapes markdown-sensitive repo and commit text", () => {
    const repo = {
      ...basePrior("org/evil|<script>"),
      description: "<img onerror=alert(1)>",
      commits: [
        {
          sha: "x",
          subject: "**bold** | pipe",
          date: "2026-07-01T10:00:00Z",
          author: "Dev",
        },
      ],
      pullRequests: [
        {
          number: 1,
          title: "_title_ #hash",
          state: "open",
          created_at: "2026-06-01T10:00:00Z",
          merged_at: "",
          labels: "a|b",
        },
      ],
    };

    const markdown = buildGithubSummaryMarkdown(
      "2026-07-20T10:00:00Z",
      [repo],
      { TypeScript: 1 },
      { totalCommits: 1, totalPullRequests: 1, repoCount: 1 },
    );

    expect(markdown).toContain("\\*\\*bold\\*\\*");
    expect(markdown).not.toContain("<img onerror=alert(1)>");
  });
});
