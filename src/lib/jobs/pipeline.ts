import { HttpRequestError } from "./http-client.js";
import { getBoardAdapter } from "./boards/index.js";
import { findInStateMap, isBlocklisted, isKnownInState } from "./dedupe.js";
import { filterPostings } from "./filter.js";
import { dedupePostings } from "./merge.js";
import { normalizeRawPosting } from "./normalize.js";
import type { ScanPolicy } from "./scan-policy.js";
import {
  applySourcePollUpdates,
  loadSourcePollState,
  shouldSkipSourcePoll,
  type SourcePollState,
  type SourcePollUpdate,
} from "./source-poll-state.js";
import { getEnabledSources, loadJobSourcesConfig } from "./sources/registry.js";
import type {
  DedupeSummary,
  JobPosting,
  JobSourceEntry,
  JobLifecycleState,
  LifecycleSuppressedCounts,
  ScanRunOutcome,
  ScanRunResult,
  ScanStateEntry,
  SourceFetchError,
  SourceStats,
} from "./types.js";
import type { RoleProfile } from "./role-profile.js";
import type { ScanState } from "./types.js";
import { getProfileSeenMap, lookupLifecycleDisposition } from "./state.js";

const MAX_CONCURRENT = 3;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export interface PipelineFetchResult {
  postings: JobPosting[];
  fetchErrors: SourceFetchError[];
  sourceStats: SourceStats[];
  blocklistExcluded: number;
  pollStateUpdates: SourcePollUpdate[];
  hadSuccessfulSourceFetch: boolean;
  outcome: ScanRunOutcome;
  dedupeSummary: DedupeSummary;
}

interface SourceWorkerResult {
  sourceIndex: number;
  postings: JobPosting[];
  stat: SourceStats;
  fetchError?: SourceFetchError;
  blocklistExcluded: number;
  pollStateUpdate?: SourcePollUpdate;
}

function formatFetchError(error: unknown): SourceFetchError["error"] {
  if (error instanceof HttpRequestError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function buildFetchError(
  source: JobSourceEntry,
  error: unknown,
): SourceFetchError {
  const base: SourceFetchError = {
    sourceId: source.id,
    adapter: source.adapter,
    error: formatFetchError(error),
  };

  if (error instanceof HttpRequestError) {
    return {
      ...base,
      status: error.status,
      attempts: error.attempts,
      retryable: error.retryable,
    };
  }

  return base;
}

function buildPollFailureUpdate(
  sourceId: string,
  attemptedAt: string,
  completedAt: string,
  error: unknown,
): SourcePollUpdate {
  const update: SourcePollUpdate = {
    sourceId,
    outcome: "failure",
    attemptedAt,
    completedAt,
  };

  if (error instanceof HttpRequestError) {
    update.error = {
      message: error.message,
      status: error.status,
      attempts: error.attempts,
    };
  } else {
    update.error = {
      message: formatFetchError(error),
    };
  }

  return update;
}

export function evaluateScanOutcome(sourceStats: SourceStats[]): ScanRunOutcome {
  const skippedSources = sourceStats.filter((stat) => stat.status === "skipped").length;
  const attemptedSources = sourceStats.length - skippedSources;
  const succeededSources = sourceStats.filter((stat) => stat.status === "success").length;
  const failedSources = sourceStats.filter((stat) => stat.status === "failure").length;

  return {
    attemptedSources,
    skippedSources,
    succeededSources,
    failedSources,
    allSkippedDueToCadence:
      sourceStats.length > 0 && skippedSources === sourceStats.length,
    totalSourceOutage:
      attemptedSources > 0 && failedSources === attemptedSources,
  };
}

export interface FetchAllBoardPostingsOptions {
  policy: ScanPolicy;
  sources?: JobSourceEntry[];
  fetchedAt?: string;
  pollState?: SourcePollState;
  forcePoll?: boolean;
  now?: () => Date;
}

export async function fetchAllBoardPostings(
  options: FetchAllBoardPostingsOptions,
): Promise<PipelineFetchResult> {
  const {
    policy,
    sources = getEnabledSources(),
    fetchedAt = new Date().toISOString(),
    pollState = loadSourcePollState(),
    forcePoll = false,
    now = () => new Date(),
  } = options;
  const blocklist = policy.blocklist;

  const workerResults = await mapWithConcurrency(
    sources,
    MAX_CONCURRENT,
    async (source, sourceIndex): Promise<SourceWorkerResult> => {
      const attemptedAt = now().toISOString();
      const minPollHours = source.minPollHours ?? 0;
      const cadence = shouldSkipSourcePoll(
        pollState.profiles[policy.roleProfile][source.id],
        minPollHours,
        now(),
        forcePoll,
      );

      if (cadence.skip) {
        return {
          sourceIndex,
          postings: [],
          blocklistExcluded: 0,
          stat: {
            sourceId: source.id,
            adapter: source.adapter,
            status: "skipped",
            skipReason: cadence.reason,
            fetched: 0,
            normalized: 0,
            quarantined: 0,
            matched: 0,
            durationMs: 0,
            failed: false,
          },
        };
      }

      const startedAt = now().getTime();
      try {
        const adapter = getBoardAdapter(source.adapter);
        const result = await adapter.fetch(source);
        const completedAt = now().toISOString();
        const normalized = result.postings.map((raw) =>
          normalizeRawPosting(raw, {
            configuredSourceId: source.id,
            adapterId: source.adapter,
            fetchedAt,
          }),
        );
        const kept: JobPosting[] = [];
        let blocklistExcluded = 0;

        for (const posting of normalized) {
          if (isBlocklisted(posting.company, blocklist)) {
            blocklistExcluded += 1;
            continue;
          }
          kept.push(posting);
        }

        return {
          sourceIndex,
          postings: kept,
          blocklistExcluded,
          pollStateUpdate: {
            sourceId: source.id,
            outcome: "success",
            attemptedAt,
            completedAt,
          },
          stat: {
            sourceId: source.id,
            adapter: source.adapter,
            status: "success",
            fetched: result.postings.length,
            normalized: normalized.length,
            quarantined: result.quarantined,
            matched: 0,
            durationMs: now().getTime() - startedAt,
            attemptedAt,
            completedAt,
            failed: false,
          },
        };
      } catch (error) {
        const completedAt = now().toISOString();
        return {
          sourceIndex,
          postings: [],
          blocklistExcluded: 0,
          pollStateUpdate: buildPollFailureUpdate(
            source.id,
            attemptedAt,
            completedAt,
            error,
          ),
          fetchError: buildFetchError(source, error),
          stat: {
            sourceId: source.id,
            adapter: source.adapter,
            status: "failure",
            fetched: 0,
            normalized: 0,
            quarantined: 0,
            matched: 0,
            durationMs: now().getTime() - startedAt,
            attemptedAt,
            completedAt,
            failed: true,
          },
        };
      }
    },
  );

  const orderedResults = [...workerResults].sort((a, b) => a.sourceIndex - b.sourceIndex);
  const allPostings: JobPosting[] = [];
  const fetchErrors: SourceFetchError[] = [];
  const sourceStats: SourceStats[] = [];
  const pollStateUpdates: SourcePollUpdate[] = [];
  let blocklistExcluded = 0;

  for (const result of orderedResults) {
    allPostings.push(...result.postings);
    sourceStats.push(result.stat);
    blocklistExcluded += result.blocklistExcluded;
    if (result.fetchError) {
      fetchErrors.push(result.fetchError);
    }
    if (result.pollStateUpdate) {
      pollStateUpdates.push(result.pollStateUpdate);
    }
  }

  const outcome = evaluateScanOutcome(sourceStats);
  const dedupeResult = dedupePostings(allPostings);

  return {
    postings: dedupeResult.postings,
    fetchErrors,
    sourceStats,
    blocklistExcluded,
    pollStateUpdates,
    hadSuccessfulSourceFetch: outcome.succeededSources > 0,
    outcome,
    dedupeSummary: dedupeResult.summary,
  };
}

export function partitionScanResults(
  matched: JobPosting[],
  scanState: ScanState,
  lifecycleState: JobLifecycleState,
  roleProfile: RoleProfile,
): {
  activeMatched: JobPosting[];
  newJobs: JobPosting[];
  previouslySeen: JobPosting[];
  stateEntries: ScanStateEntry[];
  lifecycleSuppressed: LifecycleSuppressedCounts;
} {
  const profileSeen = getProfileSeenMap(scanState, roleProfile);
  const newJobs: JobPosting[] = [];
  const previouslySeen: JobPosting[] = [];
  const activeMatched: JobPosting[] = [];
  const stateEntries: ScanStateEntry[] = [];
  const lifecycleSuppressed: LifecycleSuppressedCounts = {
    applied: 0,
    dismissed: 0,
    expired: 0,
  };

  for (const posting of matched) {
    const existingSeen = findInStateMap(posting, profileSeen);
    stateEntries.push({
      dedupeKey: posting.dedupeKey,
      company: posting.company,
      title: posting.title,
      url: posting.url,
      firstSeenAt: existingSeen?.firstSeenAt ?? posting.fetchedAt,
      lastSeenAt: posting.fetchedAt,
    });

    const disposition = lookupLifecycleDisposition(posting, lifecycleState);
    if (disposition) {
      lifecycleSuppressed[disposition] += 1;
      continue;
    }

    activeMatched.push(posting);

    const wasSeen = isKnownInState(posting, profileSeen);
    if (wasSeen) {
      previouslySeen.push(posting);
    } else {
      newJobs.push(posting);
    }
  }

  return {
    activeMatched,
    newJobs,
    previouslySeen,
    stateEntries,
    lifecycleSuppressed,
  };
}

export function attachSourceMatchCounts(
  sourceStats: SourceStats[],
  matched: JobPosting[],
): SourceStats[] {
  const counts = new Map<string, number>();
  for (const posting of matched) {
    const configuredSourceIds = new Set(
      posting.provenance.map((record) => record.configuredSourceId),
    );
    for (const sourceId of configuredSourceIds) {
      counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
    }
  }

  return sourceStats.map((stat) => ({
    ...stat,
    matched: counts.get(stat.sourceId) ?? 0,
  }));
}

export interface RunScanPipelineOptions {
  forcePoll?: boolean;
  pollState?: SourcePollState;
  now?: () => Date;
}

export async function runScanPipeline(
  policy: ScanPolicy,
  options: RunScanPipelineOptions = {},
): Promise<{
  fetchedAt: string;
  allRaw: JobPosting[];
  matched: JobPosting[];
  excluded: ScanRunResult["excluded"];
  fetchErrors: SourceFetchError[];
  sourceStats: SourceStats[];
  blocklistExcluded: number;
  pollStateUpdates: SourcePollUpdate[];
  hadSuccessfulSourceFetch: boolean;
  outcome: ScanRunOutcome;
  dedupeSummary: DedupeSummary;
}> {
  const fetchedAt = (options.now ?? (() => new Date()))().toISOString();
  loadJobSourcesConfig();
  const {
    postings,
    fetchErrors,
    sourceStats,
    blocklistExcluded,
    pollStateUpdates,
    hadSuccessfulSourceFetch,
    outcome,
    dedupeSummary,
  } = await fetchAllBoardPostings({
    policy,
    fetchedAt,
    forcePoll: options.forcePoll,
    pollState: options.pollState,
    now: options.now,
  });
  const { matched, excluded } = filterPostings(postings, policy);

  return {
    fetchedAt,
    allRaw: postings,
    matched,
    excluded,
    fetchErrors,
    sourceStats: attachSourceMatchCounts(sourceStats, matched),
    blocklistExcluded,
    pollStateUpdates,
    hadSuccessfulSourceFetch,
    outcome,
    dedupeSummary,
  };
}

export function computeNextSourcePollState(
  current: SourcePollState,
  profile: RoleProfile,
  updates: SourcePollUpdate[],
): SourcePollState {
  return applySourcePollUpdates(current, profile, updates);
}
