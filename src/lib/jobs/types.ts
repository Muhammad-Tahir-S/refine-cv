export type AtsType = "greenhouse" | "lever" | "ashby" | "workable" | "custom";

export type RemoteScope = "global" | "emea" | "regional" | "unknown";

export type LevelHint = "junior" | "mid" | "senior" | "staff_lead" | "unknown";

export interface CompanyEntry {
  name: string;
  ats: AtsType;
  slug: string;
  careersUrl?: string;
  greenhouseHost?: string;
  notes?: string;
}

export interface CompaniesConfig {
  companies: CompanyEntry[];
  blocklist: string[];
}

export interface JobPosting {
  company: string;
  title: string;
  url: string;
  location: string;
  remoteScope: RemoteScope;
  level: LevelHint;
  description: string;
  source: AtsType;
  fetchedAt: string;
  dedupeKey: string;
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

export interface FilterResult {
  matched: JobPosting[];
  excluded: Array<{ posting: JobPosting; reason: string }>;
}

export interface ScanRunResult {
  scanDate: string;
  outputDir: string;
  allMatched: JobPosting[];
  newJobs: JobPosting[];
  previouslySeen: JobPosting[];
  excluded: Array<{ posting: JobPosting; reason: string }>;
  fetchErrors: Array<{ company: string; error: string }>;
}
