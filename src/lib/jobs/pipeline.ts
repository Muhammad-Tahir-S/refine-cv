import { getBoardAdapter } from "./boards/index.js";
import { isBlocklisted } from "./dedupe.js";
import { filterPostings } from "./filter.js";
import { normalizeRawPosting } from "./normalize.js";
import type { ScanPolicy } from "./scan-policy.js";
import { getEnabledSources, loadJobSourcesConfig } from "./sources/registry.js";
import type {
  JobPosting,
  JobSourceEntry,
  ScanRunResult,
  ScanStateEntry,
  SourceFetchError,
  SourceStats,
} from "./types.js";
import { isKnownInState } from "./dedupe.js";
import type { AppliedJobsState, ScanState } from "./types.js";

const MAX_CONCURRENT = 3;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current]);
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
}

export async function fetchAllBoardPostings(
  policy: ScanPolicy,
  sources: JobSourceEntry[] = getEnabledSources(),
  fetchedAt: string = new Date().toISOString(),
): Promise<PipelineFetchResult> {
  const fetchErrors: SourceFetchError[] = [];
  const sourceStats: SourceStats[] = [];
  const blocklist = policy.blocklist;
  const allPostings: JobPosting[] = [];
  let blocklistExcluded = 0;

  const results = await mapWithConcurrency(sources, MAX_CONCURRENT, async (source) => {
    try {
      const adapter = getBoardAdapter(source.adapter);
      const result = await adapter.fetch(source);
      const normalized = result.postings.map((raw) => normalizeRawPosting(raw, fetchedAt));
      const kept: JobPosting[] = [];

      for (const posting of normalized) {
        if (isBlocklisted(posting.company, blocklist)) {
          blocklistExcluded += 1;
          continue;
        }
        kept.push(posting);
      }

      sourceStats.push({
        sourceId: source.id,
        adapter: source.adapter,
        fetched: result.postings.length,
        normalized: normalized.length,
        quarantined: result.quarantined,
        matched: 0,
        failed: false,
      });

      return kept;
    } catch (error) {
      fetchErrors.push({
        sourceId: source.id,
        adapter: source.adapter,
        error: error instanceof Error ? error.message : String(error),
      });
      sourceStats.push({
        sourceId: source.id,
        adapter: source.adapter,
        fetched: 0,
        normalized: 0,
        quarantined: 0,
        matched: 0,
        failed: true,
      });
      return [] as JobPosting[];
    }
  });

  for (const batch of results) {
    allPostings.push(...batch);
  }

  return { postings: allPostings, fetchErrors, sourceStats, blocklistExcluded };
}

export function partitionScanResults(
  matched: JobPosting[],
  scanState: ScanState,
  appliedState: AppliedJobsState,
): {
  newJobs: JobPosting[];
  previouslySeen: JobPosting[];
  stateEntries: ScanStateEntry[];
} {
  const newJobs: JobPosting[] = [];
  const previouslySeen: JobPosting[] = [];
  const stateEntries: ScanStateEntry[] = [];

  for (const posting of matched) {
    stateEntries.push({
      dedupeKey: posting.dedupeKey,
      company: posting.company,
      title: posting.title,
      url: posting.url,
      firstSeenAt: scanState.seen[posting.dedupeKey]?.firstSeenAt ?? posting.fetchedAt,
      lastSeenAt: posting.fetchedAt,
    });

    const isApplied = isKnownInState(posting, appliedState.applied);
    const wasSeen = isKnownInState(posting, scanState.seen);

    if (isApplied) {
      continue;
    }

    if (wasSeen) {
      previouslySeen.push(posting);
    } else {
      newJobs.push(posting);
    }
  }

  return { newJobs, previouslySeen, stateEntries };
}

export function attachSourceMatchCounts(
  sourceStats: SourceStats[],
  matched: JobPosting[],
): SourceStats[] {
  const counts = new Map<string, number>();
  for (const posting of matched) {
    counts.set(posting.source, (counts.get(posting.source) ?? 0) + 1);
  }

  return sourceStats.map((stat) => ({
    ...stat,
    matched: counts.get(stat.adapter) ?? 0,
  }));
}

export async function runScanPipeline(policy: ScanPolicy): Promise<{
  fetchedAt: string;
  allRaw: JobPosting[];
  matched: JobPosting[];
  excluded: ScanRunResult["excluded"];
  fetchErrors: SourceFetchError[];
  sourceStats: SourceStats[];
  blocklistExcluded: number;
}> {
  const fetchedAt = new Date().toISOString();
  loadJobSourcesConfig();
  const { postings, fetchErrors, sourceStats, blocklistExcluded } =
    await fetchAllBoardPostings(policy, undefined, fetchedAt);
  const { matched, excluded } = filterPostings(postings, policy);

  return {
    fetchedAt,
    allRaw: postings,
    matched,
    excluded,
    fetchErrors,
    sourceStats: attachSourceMatchCounts(sourceStats, matched),
    blocklistExcluded,
  };
}
