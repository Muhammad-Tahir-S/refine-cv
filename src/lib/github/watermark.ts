import type { CommitSample, RepoCompleteness } from "./schema.js";
import { DEFAULT_WATERMARK_OVERLAP_SECONDS } from "./schema.js";

export function computeIncrementalSince(
  lastIndexedAt: string | undefined,
  overlapSeconds: number = DEFAULT_WATERMARK_OVERLAP_SECONDS,
): string | undefined {
  if (!lastIndexedAt?.trim()) {
    return undefined;
  }
  const ms = Date.parse(lastIndexedAt);
  if (!Number.isFinite(ms)) {
    return undefined;
  }
  return new Date(ms - overlapSeconds * 1000).toISOString();
}

export function latestCommitEvidence(
  commits: CommitSample[],
): { latestCommitSha: string; latestCommitDate: string } {
  if (commits.length === 0) {
    return { latestCommitSha: "", latestCommitDate: "" };
  }

  let latest = commits[0]!;
  let latestMs = Date.parse(latest.date);
  if (!Number.isFinite(latestMs)) latestMs = 0;

  for (const commit of commits.slice(1)) {
    const ms = Date.parse(commit.date);
    if (Number.isFinite(ms) && ms > latestMs) {
      latest = commit;
      latestMs = ms;
    }
  }

  return {
    latestCommitSha: latest.sha,
    latestCommitDate: latest.date,
  };
}

export function shouldAdvanceWatermark(
  completeness: RepoCompleteness,
  fetchSucceeded: boolean,
): boolean {
  if (!fetchSucceeded) {
    return false;
  }
  if (
    completeness.commitsTruncatedThisRun ||
    completeness.pullRequestsTruncatedThisRun
  ) {
    return false;
  }
  if (
    !completeness.commitsHistoryComplete ||
    !completeness.pullRequestsHistoryComplete
  ) {
    return false;
  }
  return true;
}

export function buildCompletenessFlags(input: {
  fetchMode: "first-run" | "incremental";
  commitLimit: number;
  prLimit: number;
  commitsFetchedThisRun: number;
  pullRequestsFetchedThisRun: number;
  includePullRequests: boolean;
  priorCommitsHistoryComplete: boolean;
  priorPullRequestsHistoryComplete: boolean;
}): RepoCompleteness {
  const commitsTruncatedThisRun =
    input.commitLimit > 0 && input.commitsFetchedThisRun >= input.commitLimit;
  const pullRequestsTruncatedThisRun =
    input.includePullRequests &&
    input.prLimit > 0 &&
    input.pullRequestsFetchedThisRun >= input.prLimit;

  const fullHistoryFetch = input.fetchMode === "first-run";
  const uncappedCommits = input.commitLimit === 0;
  const uncappedPullRequests =
    !input.includePullRequests || input.prLimit === 0;

  const commitsHistoryComplete = fullHistoryFetch
    ? uncappedCommits && !commitsTruncatedThisRun
    : input.priorCommitsHistoryComplete && !commitsTruncatedThisRun;
  const pullRequestsHistoryComplete = input.includePullRequests
    ? fullHistoryFetch
      ? uncappedPullRequests && !pullRequestsTruncatedThisRun
      : input.priorPullRequestsHistoryComplete && !pullRequestsTruncatedThisRun
    : true;

  return {
    commitsHistoryComplete,
    pullRequestsHistoryComplete,
    commitsTruncatedThisRun,
    pullRequestsTruncatedThisRun,
  };
}
