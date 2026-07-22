import type { IndexState } from "../config.js";
import type { CommitAuthorIdentity } from "./commit-author.js";
import { computeRepoThemes } from "./aggregate.js";
import { sortCommits, sortPullRequests } from "./merge.js";
import {
  DEFAULT_WATERMARK_OVERLAP_SECONDS,
  GITHUB_INDEX_VERSION,
  GithubIndexMigrationError,
  parseGithubIndexV4,
  type CommitSample,
  type GithubIndexV4,
  type PrSample,
  type RepoSnapshot,
} from "./schema.js";

interface GithubIndexV3Repo {
  repo: string;
  mode?: string;
  description?: string;
  topics?: string[];
  defaultBranch?: string;
  pushedAt?: string;
  languages?: Record<string, number>;
  commitCountThisRun?: number;
  commits?: CommitSample[];
  sampleCommits?: CommitSample[];
  pullRequests?: PrSample[];
  inferredThemes?: string[];
  watermark?: {
    since?: string;
    latestCommitSha?: string;
  };
}

interface GithubIndexV3 {
  version: 3;
  generatedAt?: string;
  indexScope?: string;
  authorIdentity?: CommitAuthorIdentity;
  repos?: GithubIndexV3Repo[];
  aggregate?: {
    languages?: Record<string, number>;
    repoCount?: number;
    totalCommitsThisRun?: number;
    totalPullRequests?: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCommit(raw: unknown): CommitSample | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.sha !== "string" || !raw.sha) return null;
  return {
    sha: raw.sha,
    subject: typeof raw.subject === "string" ? raw.subject : "",
    date: typeof raw.date === "string" ? raw.date : "",
    author: typeof raw.author === "string" ? raw.author : "",
  };
}

function normalizePr(raw: unknown): PrSample | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.number !== "number") return null;
  return {
    number: raw.number,
    title: typeof raw.title === "string" ? raw.title : "",
    state: typeof raw.state === "string" ? raw.state : "",
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    merged_at: typeof raw.merged_at === "string" ? raw.merged_at : "",
    labels: typeof raw.labels === "string" ? raw.labels : "",
  };
}

function commitsFromV3Repo(repo: GithubIndexV3Repo): CommitSample[] {
  const primary = (repo.commits ?? [])
    .map(normalizeCommit)
    .filter((c): c is CommitSample => c !== null);
  if (primary.length > 0) {
    return sortCommits(primary);
  }
  return sortCommits(
    (repo.sampleCommits ?? [])
      .map(normalizeCommit)
      .filter((c): c is CommitSample => c !== null),
  );
}

function migrateV3Repo(
  repo: GithubIndexV3Repo,
  indexState: IndexState | undefined,
  snapshotAt: string,
): RepoSnapshot {
  const commits = commitsFromV3Repo(repo);
  const pullRequests = sortPullRequests(
    (repo.pullRequests ?? [])
      .map(normalizePr)
      .filter((p): p is PrSample => p !== null),
  );
  const stateRepo = indexState?.repos[repo.repo];
  const lastIndexedAt =
    stateRepo?.lastIndexedAt ??
    repo.watermark?.since ??
    snapshotAt;

  const latestSha =
    stateRepo?.latestCommitSha ?? repo.watermark?.latestCommitSha ?? "";
  const latestDate =
    commits.find((c) => c.sha === latestSha)?.date ??
    commits[0]?.date ??
    "";

  return {
    repo: repo.repo,
    description: repo.description ?? "",
    topics: repo.topics ?? [],
    defaultBranch: repo.defaultBranch ?? "main",
    pushedAt: repo.pushedAt ?? "",
    languages: repo.languages ?? {},
    commits,
    pullRequests,
    inferredThemes:
      repo.inferredThemes && repo.inferredThemes.length > 0
        ? [...repo.inferredThemes].sort()
        : computeRepoThemes(commits, pullRequests),
    completeness: {
      // A v3 "incremental" entry could contain only the latest delta because
      // v3 replaced its repo arrays on every run. No v3 entry can prove that
      // the arrays are complete, so force one uncapped full-history repair.
      commitsHistoryComplete: false,
      pullRequestsHistoryComplete: false,
      commitsTruncatedThisRun: false,
      pullRequestsTruncatedThisRun: false,
    },
    watermark: {
      lastIndexedAt,
      latestCommitSha: latestSha,
      latestCommitDate: latestDate,
      overlapSeconds: DEFAULT_WATERMARK_OVERLAP_SECONDS,
    },
  };
}

export function migrateGithubIndexV3(
  raw: GithubIndexV3,
  indexState?: IndexState,
): GithubIndexV4 {
  const snapshotAt = raw.generatedAt ?? new Date(0).toISOString();
  const repos = (raw.repos ?? [])
    .filter((repo) => typeof repo.repo === "string" && repo.repo.length > 0)
    .map((repo) => migrateV3Repo(repo, indexState, snapshotAt));

  const authorIdentity: CommitAuthorIdentity = raw.authorIdentity ?? {
    githubLogins: [],
    commitNames: [],
  };

  const selectedRepos = repos.map((repo) => repo.repo).sort();

  return {
    version: GITHUB_INDEX_VERSION,
    snapshotAt,
    indexScope: "author-full-history",
    authorIdentity,
    selectedRepos,
    repos,
    aggregate: {
      languages: raw.aggregate?.languages ?? {},
      repoCount: repos.length,
      totalCommits: repos.reduce((n, repo) => n + repo.commits.length, 0),
      totalPullRequests: repos.reduce(
        (n, repo) => n + repo.pullRequests.length,
        0,
      ),
    },
  };
}

export function loadGithubIndexDocument(
  raw: unknown,
  indexState?: IndexState,
  sourcePath = "github-index.json",
): GithubIndexV4 | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (!isRecord(raw)) {
    throw new GithubIndexMigrationError(
      `GitHub index at ${sourcePath} is not a JSON object. Fix or restore from backup before retrying.`,
      sourcePath,
      raw,
    );
  }

  const version = raw.version;
  if (version === GITHUB_INDEX_VERSION) {
    return parseGithubIndexV4(raw);
  }

  if (version === 3) {
    return migrateGithubIndexV3(raw as unknown as GithubIndexV3, indexState);
  }

  throw new GithubIndexMigrationError(
    `Unsupported GitHub index version ${String(version)} at ${sourcePath}. ` +
      `Supported versions: 3 (migrate), ${GITHUB_INDEX_VERSION}. ` +
      `Preserve the file and migrate manually or restore from backup.`,
    sourcePath,
    version,
  );
}

export function parseAndValidateGithubIndex(
  raw: unknown,
  indexState?: IndexState,
  sourcePath = "github-index.json",
): GithubIndexV4 | null {
  const loaded = loadGithubIndexDocument(raw, indexState, sourcePath);
  if (!loaded) {
    return null;
  }
  return parseGithubIndexV4(loaded);
}
