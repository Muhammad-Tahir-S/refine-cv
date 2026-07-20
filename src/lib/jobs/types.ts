import type { RoleProfile } from "./role-profile.js";
import type { SerializedScanPolicy } from "./scan-policy.js";

export type JobSourceId =
  | "himalayas"
  | "jobicy"
  | "remotive"
  | "arbeitnow"
  | "remoteok"
  | "wwr"
  | "hn-hiring"
  | "linkedin";

export type RemoteScope = "global" | "emea" | "regional" | "unknown";

export type GeoEligibility = "nigeria_eligible" | "verify_geo" | "likely_excluded";

export type LevelHint = "junior" | "mid" | "senior" | "staff_lead" | "unknown";

export interface JobProvenance {
  configuredSourceId: string;
  adapterId: JobSourceId;
  providerSourceJobId?: string;
  originalUrl: string;
  fetchedAt: string;
}

export interface DedupeSummary {
  inputCount: number;
  outputCount: number;
  mergedCount: number;
}

export interface JobPosting {
  company: string;
  title: string;
  url: string;
  listingUrl?: string;
  location: string;
  remoteScope: RemoteScope;
  geoEligibility?: GeoEligibility;
  level: LevelHint;
  description: string;
  /** Primary adapter for the merged posting (backward compatibility). */
  source: JobSourceId;
  configuredSourceIds: string[];
  provenance: JobProvenance[];
  sourceJobId?: string;
  postedAt?: string;
  attribution?: string;
  fetchedAt: string;
  dedupeKey: string;
  legacyDedupeKey: string;
  legacyUrlDedupeKey?: string;
  identityAliases: string[];
}

export interface RawPosting {
  sourceId: JobSourceId;
  sourceJobId: string;
  company: string;
  title: string;
  url: string;
  listingUrl?: string;
  location: string;
  description: string;
  postedAt?: string;
  attribution?: string;
}

export interface JobSourceEntry {
  id: string;
  adapter: JobSourceId;
  enabled: boolean;
  minPollHours?: number;
  attribution?: string;
  query?: string;
  worldwide?: boolean;
  maxPages?: number;
  tag?: string;
  count?: number;
  search?: string;
  category?: string;
  tags?: string;
  feeds?: string[];
}

export interface JobSourcesConfig {
  version: number;
  attribution?: string;
  sources: JobSourceEntry[];
}

export interface ScanStateEntry {
  dedupeKey: string;
  company: string;
  title: string;
  url: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ScanStateV2 {
  version: 2;
  seen: Record<string, ScanStateEntry>;
}

export interface ScanState {
  version: 3;
  profiles: Record<RoleProfile, Record<string, ScanStateEntry>>;
}

export interface AppliedJob {
  dedupeKey: string;
  company: string;
  title: string;
  url: string;
  appliedAt: string;
  sourceReport?: string;
}

/** @deprecated Use JobLifecycleState — kept for v1 migration input typing */
export interface AppliedJobsState {
  version: 1;
  applied: Record<string, AppliedJob>;
}

export interface DismissedJob {
  dedupeKey: string;
  company: string;
  title: string;
  url: string;
  dismissedAt: string;
  sourceReport?: string;
}

export interface ExpiredJob {
  dedupeKey: string;
  company: string;
  title: string;
  url: string;
  expiredAt: string;
  sourceReport?: string;
}

export type JobLifecycleDisposition = "applied" | "dismissed" | "expired";

export interface JobLifecycleState {
  version: 2;
  applied: Record<string, AppliedJob>;
  dismissed: Record<string, DismissedJob>;
  expired: Record<string, ExpiredJob>;
}

export interface LifecycleSuppressedCounts {
  applied: number;
  dismissed: number;
  expired: number;
}

export interface LinkedInDiscoveryState {
  version: 1;
  lastRunAt: string | null;
}

export type SourceFetchStatus = "success" | "failure" | "skipped";

export interface SourceFetchError {
  sourceId: string;
  adapter: string;
  error: string;
  status?: number;
  attempts?: number;
  retryable?: boolean;
}

export interface SourceStats {
  sourceId: string;
  adapter: string;
  status: SourceFetchStatus;
  skipReason?: string;
  fetched: number;
  normalized: number;
  quarantined: number;
  matched: number;
  durationMs: number;
  attemptedAt?: string;
  completedAt?: string;
  /** @deprecated Use status === "failure" */
  failed: boolean;
}

export interface ScanRunOutcome {
  attemptedSources: number;
  skippedSources: number;
  succeededSources: number;
  failedSources: number;
  allSkippedDueToCadence: boolean;
  totalSourceOutage: boolean;
}


export interface ScanRunResult {
  scanDate: string;
  outputDir: string;
  runId: string;
  policy: SerializedScanPolicy;
  /** Active matches only — excludes applied, dismissed, and expired jobs */
  allMatched: JobPosting[];
  newJobs: JobPosting[];
  previouslySeen: JobPosting[];
  lifecycleSuppressed: LifecycleSuppressedCounts;
  excluded: Array<{ posting: JobPosting; reason: string }>;
  blocklistExcluded: number;
  dedupeSummary: DedupeSummary;
  fetchErrors: SourceFetchError[];
  sourceStats: SourceStats[];
  outcome: ScanRunOutcome;
  /** False when every enabled source was cadence-skipped — no fresh board listings were fetched. */
  hadSuccessfulSourceFetch: boolean;
}
