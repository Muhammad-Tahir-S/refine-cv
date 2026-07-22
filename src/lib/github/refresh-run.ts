import type { IndexState } from "../config.js";
import type { CommitAuthorIdentity } from "./commit-author.js";
import {
  computeAggregate,
  computeRepoThemes,
  sortRepoSnapshots,
} from "./aggregate.js";
import {
  mergeCommitsBySha,
  mergePullRequestsByNumber,
} from "./merge.js";
import {
  buildCompletenessFlags,
  computeIncrementalSince,
  latestCommitEvidence,
  shouldAdvanceWatermark,
} from "./watermark.js";
import {
  DEFAULT_WATERMARK_OVERLAP_SECONDS,
  GITHUB_DELTA_VERSION,
  GITHUB_INDEX_VERSION,
  type CommitSample,
  type GithubDelta,
  type GithubIndexV4,
  type PrSample,
  type RepoDelta,
  type RepoFailure,
  type RepoSnapshot,
} from "./schema.js";

export interface RepoFetchSuccess {
  ok: true;
  repo: string;
  fetchMode: "first-run" | "incremental";
  description: string;
  topics: string[];
  defaultBranch: string;
  pushedAt: string;
  languages: Record<string, number>;
  fetchedCommits: CommitSample[];
  fetchedPullRequests: PrSample[];
  commitsFetchedThisRun: number;
  pullRequestsFetchedThisRun: number;
  commitsTruncatedThisRun: boolean;
  pullRequestsTruncatedThisRun: boolean;
}

export interface RepoFetchFailure {
  ok: false;
  repo: string;
  error: string;
}

export type RepoFetchOutcome = RepoFetchSuccess | RepoFetchFailure;

export interface BuildRefreshInput {
  runAt: string;
  selectedRepos: string[];
  authorIdentity: CommitAuthorIdentity;
  priorIndex: GithubIndexV4 | null;
  priorIndexState: IndexState;
  outcomes: RepoFetchOutcome[];
  commitLimit: number;
  prLimit: number;
  includePullRequests: boolean;
  overlapSeconds?: number;
}

export interface BuildRefreshResult {
  index: GithubIndexV4;
  delta: GithubDelta;
  indexState: IndexState;
}

function priorRepoMap(priorIndex: GithubIndexV4 | null): Map<string, RepoSnapshot> {
  const map = new Map<string, RepoSnapshot>();
  for (const repo of priorIndex?.repos ?? []) {
    map.set(repo.repo, repo);
  }
  return map;
}

function emptyRepoSnapshot(repo: string, overlapSeconds: number): RepoSnapshot {
  return {
    repo,
    description: "",
    topics: [],
    defaultBranch: "main",
    pushedAt: "",
    languages: {},
    commits: [],
    pullRequests: [],
    inferredThemes: [],
    completeness: {
      commitsHistoryComplete: true,
      pullRequestsHistoryComplete: true,
      commitsTruncatedThisRun: false,
      pullRequestsTruncatedThisRun: false,
    },
    watermark: {
      lastIndexedAt: "",
      latestCommitSha: "",
      latestCommitDate: "",
      overlapSeconds,
    },
  };
}

function mergeRepoSnapshot(input: {
  prior: RepoSnapshot;
  outcome: RepoFetchSuccess;
  runAt: string;
  commitLimit: number;
  prLimit: number;
  includePullRequests: boolean;
  overlapSeconds: number;
}): { snapshot: RepoSnapshot; delta: RepoDelta } {
  const commitMerge = mergeCommitsBySha(input.prior.commits, input.outcome.fetchedCommits);
  const prMerge = mergePullRequestsByNumber(
    input.prior.pullRequests,
    input.outcome.fetchedPullRequests,
  );

  const completeness = buildCompletenessFlags({
    fetchMode: input.outcome.fetchMode,
    commitLimit: input.commitLimit,
    prLimit: input.prLimit,
    commitsFetchedThisRun: input.outcome.commitsFetchedThisRun,
    pullRequestsFetchedThisRun: input.outcome.pullRequestsFetchedThisRun,
    includePullRequests: input.includePullRequests,
    priorCommitsHistoryComplete: input.prior.completeness.commitsHistoryComplete,
    priorPullRequestsHistoryComplete:
      input.prior.completeness.pullRequestsHistoryComplete,
  });

  if (input.outcome.commitsTruncatedThisRun) {
    completeness.commitsTruncatedThisRun = true;
    completeness.commitsHistoryComplete = false;
  }
  if (input.outcome.pullRequestsTruncatedThisRun) {
    completeness.pullRequestsTruncatedThisRun = true;
    completeness.pullRequestsHistoryComplete = false;
  }

  const latest = latestCommitEvidence(commitMerge.merged);
  const advance = shouldAdvanceWatermark(completeness, true);
  const priorWatermark = input.prior.watermark;

  const watermark = {
    lastIndexedAt: advance ? input.runAt : priorWatermark.lastIndexedAt,
    latestCommitSha: latest.latestCommitSha || priorWatermark.latestCommitSha,
    latestCommitDate: latest.latestCommitDate || priorWatermark.latestCommitDate,
    overlapSeconds: input.overlapSeconds,
  };

  const snapshot: RepoSnapshot = {
    repo: input.outcome.repo,
    description: input.outcome.description,
    topics: input.outcome.topics.length > 0 ? input.outcome.topics : input.prior.topics,
    defaultBranch: input.outcome.defaultBranch || input.prior.defaultBranch,
    pushedAt: input.outcome.pushedAt || input.prior.pushedAt,
    languages:
      Object.keys(input.outcome.languages).length > 0
        ? input.outcome.languages
        : input.prior.languages,
    commits: commitMerge.merged,
    pullRequests: prMerge.merged,
    inferredThemes: computeRepoThemes(commitMerge.merged, prMerge.merged),
    completeness,
    watermark,
  };

  return {
    snapshot,
    delta: {
      fetchMode: input.outcome.fetchMode,
      commitsAdded: commitMerge.added,
      commitsUpdated: commitMerge.updated,
      pullRequestsAdded: prMerge.added,
      pullRequestsUpdated: prMerge.updated,
      commitsFetchedThisRun: input.outcome.commitsFetchedThisRun,
      pullRequestsFetchedThisRun: input.outcome.pullRequestsFetchedThisRun,
    },
  };
}

export function computeRepoFetchSince(
  prior: RepoSnapshot | undefined,
  priorIndexState: IndexState,
  repo: string,
  overlapSeconds: number = DEFAULT_WATERMARK_OVERLAP_SECONDS,
): string | undefined {
  if (
    prior &&
    (!prior.completeness.commitsHistoryComplete ||
      !prior.completeness.pullRequestsHistoryComplete)
  ) {
    return undefined;
  }

  const committedState = priorIndexState.repos[repo];
  const lastIndexedAt =
    committedState?.lastIndexedAt ||
    prior?.watermark.lastIndexedAt ||
    undefined;
  return computeIncrementalSince(lastIndexedAt, overlapSeconds);
}

export function buildGithubRefreshResult(
  input: BuildRefreshInput,
): BuildRefreshResult {
  const overlapSeconds = input.overlapSeconds ?? DEFAULT_WATERMARK_OVERLAP_SECONDS;
  const priorByRepo = priorRepoMap(input.priorIndex);
  const snapshots: RepoSnapshot[] = [];
  const perRepo: Record<string, RepoDelta> = {};
  const reposSucceeded: string[] = [];
  const reposFailed: RepoFailure[] = [];

  let commitsAdded = 0;
  let commitsUpdated = 0;
  let pullRequestsAdded = 0;
  let pullRequestsUpdated = 0;

  const outcomeByRepo = new Map(input.outcomes.map((o) => [o.repo, o]));

  for (const repo of [...input.selectedRepos].sort()) {
    const outcome = outcomeByRepo.get(repo);
    const prior = priorByRepo.get(repo) ?? emptyRepoSnapshot(repo, overlapSeconds);

    if (!outcome) {
      snapshots.push(prior);
      continue;
    }

    if (!outcome.ok) {
      reposFailed.push({ repo, error: outcome.error });
      snapshots.push(prior);
      continue;
    }

    const { snapshot, delta } = mergeRepoSnapshot({
      prior,
      outcome,
      runAt: input.runAt,
      commitLimit: input.commitLimit,
      prLimit: input.prLimit,
      includePullRequests: input.includePullRequests,
      overlapSeconds,
    });

    reposSucceeded.push(repo);
    snapshots.push(snapshot);
    perRepo[repo] = delta;
    commitsAdded += delta.commitsAdded.length;
    commitsUpdated += delta.commitsUpdated.length;
    pullRequestsAdded += delta.pullRequestsAdded.length;
    pullRequestsUpdated += delta.pullRequestsUpdated.length;
  }

  const sortedSnapshots = sortRepoSnapshots(snapshots);
  const aggregate = computeAggregate(sortedSnapshots);

  const index: GithubIndexV4 = {
    version: GITHUB_INDEX_VERSION,
    snapshotAt: input.runAt,
    indexScope: "author-full-history",
    authorIdentity: input.authorIdentity,
    selectedRepos: [...input.selectedRepos].sort(),
    repos: sortedSnapshots,
    aggregate,
  };

  const delta: GithubDelta = {
    version: GITHUB_DELTA_VERSION,
    runAt: input.runAt,
    reposAttempted: [...input.selectedRepos].sort(),
    reposSucceeded,
    reposFailed,
    perRepo,
    aggregateDelta: {
      commitsAdded,
      commitsUpdated,
      pullRequestsAdded,
      pullRequestsUpdated,
    },
    diagnostics: {
      watermarkOverlapSeconds: overlapSeconds,
      warnings:
        (input.commitLimit > 0 || input.prLimit > 0) &&
        sortedSnapshots.some(
          (repo) =>
            !repo.completeness.commitsHistoryComplete ||
            !repo.completeness.pullRequestsHistoryComplete,
        )
          ? [
              "Full GitHub history repair is incomplete because a per-repo limit truncated retrieval. Set maxCommitsPerRepo and maxPullRequestsPerRepo to 0, then rerun.",
            ]
          : [],
    },
  };

  const fullIndexSucceeded =
    reposFailed.length === 0 &&
    reposSucceeded.length === input.selectedRepos.length &&
    sortedSnapshots.every(
      (snapshot) =>
        snapshot.completeness.commitsHistoryComplete &&
        snapshot.completeness.pullRequestsHistoryComplete &&
        !snapshot.completeness.commitsTruncatedThisRun &&
        !snapshot.completeness.pullRequestsTruncatedThisRun,
    );

  const indexState: IndexState = {
    version: 1,
    lastFullIndexAt: fullIndexSucceeded
      ? input.runAt
      : input.priorIndexState.lastFullIndexAt,
    repos: { ...input.priorIndexState.repos },
  };

  for (const snapshot of sortedSnapshots) {
    if (!input.selectedRepos.includes(snapshot.repo)) {
      continue;
    }
    const repoDelta = perRepo[snapshot.repo];
    if (!repoDelta) {
      continue;
    }
    if (shouldAdvanceWatermark(snapshot.completeness, true)) {
      indexState.repos[snapshot.repo] = {
        lastIndexedAt: snapshot.watermark.lastIndexedAt,
        latestCommitSha: snapshot.watermark.latestCommitSha,
      };
    }
  }

  return { index, delta, indexState };
}

export function zeroChangeRepoOutcome(
  repo: string,
  fetchMode: "first-run" | "incremental",
): RepoFetchSuccess {
  return {
    ok: true,
    repo,
    fetchMode,
    description: "",
    topics: [],
    defaultBranch: "main",
    pushedAt: "",
    languages: {},
    fetchedCommits: [],
    fetchedPullRequests: [],
    commitsFetchedThisRun: 0,
    pullRequestsFetchedThisRun: 0,
    commitsTruncatedThisRun: false,
    pullRequestsTruncatedThisRun: false,
  };
}
