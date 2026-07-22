import { describe, expect, it } from "vitest";
import {
  GithubIndexMigrationError,
  GITHUB_INDEX_VERSION,
} from "../../src/lib/github/schema.ts";
import {
  loadGithubIndexDocument,
  migrateGithubIndexV3,
} from "../../src/lib/github/migrate.ts";
import {
  buildGithubRefreshResult,
  computeRepoFetchSince,
  zeroChangeRepoOutcome,
} from "../../src/lib/github/refresh-run.ts";

describe("github index migration", () => {
  it("migrates v3 repo arrays into v4 snapshots preserving evidence", () => {
    const migrated = migrateGithubIndexV3(
      {
        version: 3,
        generatedAt: "2026-07-18T05:48:14.775Z",
        authorIdentity: {
          githubLogins: ["dev"],
          commitNames: ["Dev User"],
        },
        repos: [
          {
            repo: "org/app",
            mode: "incremental",
            commitCountThisRun: 0,
            commits: [],
            sampleCommits: [
              {
                sha: "abc123",
                subject: "Fix auth",
                date: "2026-07-01T10:00:00Z",
                author: "Dev User",
              },
            ],
            pullRequests: [
              {
                number: 12,
                title: "Add login",
                state: "merged",
                created_at: "2026-06-01T10:00:00Z",
                merged_at: "2026-06-02T10:00:00Z",
                labels: "feature",
              },
            ],
            watermark: { since: "2026-07-17T00:00:00Z", latestCommitSha: "abc123" },
          },
        ],
        aggregate: {
          totalCommitsThisRun: 0,
          totalPullRequests: 1,
        },
      },
      {
        version: 1,
        lastFullIndexAt: "2026-07-18T05:48:14.775Z",
        repos: {
          "org/app": {
            lastIndexedAt: "2026-07-18T05:48:14.775Z",
            latestCommitSha: "abc123",
          },
        },
      },
    );

    expect(migrated.version).toBe(GITHUB_INDEX_VERSION);
    expect(migrated.repos).toHaveLength(1);
    expect(migrated.repos[0]?.commits[0]?.sha).toBe("abc123");
    expect(migrated.aggregate.totalCommits).toBe(1);
    expect(migrated.aggregate.totalPullRequests).toBe(1);
    expect(migrated.repos[0]?.completeness.commitsHistoryComplete).toBe(false);
    expect(migrated.repos[0]?.completeness.pullRequestsHistoryComplete).toBe(false);
  });

  it("forces a full repair after migration, then resumes incremental refresh", () => {
    const migrated = migrateGithubIndexV3({
      version: 3,
      generatedAt: "2026-07-18T00:00:00Z",
      repos: [
        {
          repo: "org/app",
          mode: "incremental",
          commits: [
            {
              sha: "latest-only",
              subject: "Latest",
              date: "2026-07-18T00:00:00Z",
              author: "Dev",
            },
          ],
          pullRequests: [],
        },
      ],
    });
    const state = {
      version: 1 as const,
      lastFullIndexAt: null,
      repos: {
        "org/app": {
          lastIndexedAt: "2026-07-18T00:00:00Z",
          latestCommitSha: "latest-only",
        },
      },
    };

    expect(computeRepoFetchSince(migrated.repos[0], state, "org/app")).toBeUndefined();

    const repaired = buildGithubRefreshResult({
      runAt: "2026-07-20T00:00:00Z",
      selectedRepos: ["org/app"],
      authorIdentity: migrated.authorIdentity,
      priorIndex: migrated,
      priorIndexState: state,
      outcomes: [
        {
          ...zeroChangeRepoOutcome("org/app", "first-run"),
          fetchedCommits: [
            migrated.repos[0]!.commits[0]!,
            {
              sha: "historical",
              subject: "Historical",
              date: "2025-01-01T00:00:00Z",
              author: "Dev",
            },
          ],
          commitsFetchedThisRun: 2,
        },
      ],
      commitLimit: 0,
      prLimit: 0,
      includePullRequests: true,
    });

    expect(repaired.index.repos[0]?.completeness.commitsHistoryComplete).toBe(true);
    expect(repaired.index.repos[0]?.completeness.pullRequestsHistoryComplete).toBe(true);
    expect(
      computeRepoFetchSince(repaired.index.repos[0], repaired.indexState, "org/app"),
    ).toBe("2026-07-19T23:00:00.000Z");
  });

  it("rejects unsupported versions with actionable errors", () => {
    expect(() =>
      loadGithubIndexDocument({ version: 2, repos: [] }, undefined, "idx.json"),
    ).toThrow(GithubIndexMigrationError);
  });
});
