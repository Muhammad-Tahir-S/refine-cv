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
  source: JobSourceId;
  sourceJobId?: string;
  postedAt?: string;
  attribution?: string;
  fetchedAt: string;
  dedupeKey: string;
  legacyDedupeKey: string;
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

export interface ScanState {
  version: number;
  seen: Record<string, ScanStateEntry>;
}

export interface AppliedJob {
  dedupeKey: string;
  company: string;
  title: string;
  url: string;
  appliedAt: string;
  sourceReport?: string;
}

export interface AppliedJobsState {
  version: number;
  applied: Record<string, AppliedJob>;
}

export interface SourceFetchError {
  sourceId: string;
  adapter: string;
  error: string;
}

export interface SourceStats {
  sourceId: string;
  adapter: string;
  fetched: number;
  normalized: number;
  quarantined: number;
  matched: number;
  failed: boolean;
}

export interface ScanRunResult {
  scanDate: string;
  outputDir: string;
  allMatched: JobPosting[];
  newJobs: JobPosting[];
  previouslySeen: JobPosting[];
  excluded: Array<{ posting: JobPosting; reason: string }>;
  blocklistExcluded: number;
  fetchErrors: SourceFetchError[];
  sourceStats: SourceStats[];
}
