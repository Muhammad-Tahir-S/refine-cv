import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  findInStateMap,
  makeLegacyDedupeKey,
  makeLegacyUrlDedupeKey,
} from "./dedupe.js";
import { atomicWriteJson, loadPersistedState } from "./persistence.js";
import { listCompletedJobScanDirs } from "./scan-run.js";
import { decodeHtmlEntities } from "./normalize.js";
import { unescapeMarkdownInline } from "./markdown-safe.js";
import type { RoleProfile } from "./role-profile.js";
import type {
  AppliedJob,
  AppliedJobsState,
  DismissedJob,
  ExpiredJob,
  JobLifecycleDisposition,
  JobLifecycleState,
  JobPosting,
  LinkedInDiscoveryState,
  ScanState,
  ScanStateEntry,
} from "./types.js";

export const REFINE_CV_CONFIG_DIR = join(homedir(), ".config", "refine-cv");
export const SCAN_STATE_PATH = join(REFINE_CV_CONFIG_DIR, "scan-state.json");
export const APPLIED_JOBS_PATH = join(REFINE_CV_CONFIG_DIR, "applied-jobs.json");
export const LINKEDIN_PROFILE_DIR = join(REFINE_CV_CONFIG_DIR, "linkedin-profile");
export const LINKEDIN_DISCOVERY_STATE_PATH = join(
  REFINE_CV_CONFIG_DIR,
  "linkedin-discovery-state.json",
);

const ScanStateEntrySchema = z.object({
  dedupeKey: z.string(),
  company: z.string(),
  title: z.string(),
  url: z.string(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
});

const ScanStateV2Schema = z.object({
  version: z.literal(2),
  seen: z.record(z.string(), ScanStateEntrySchema),
});

const ScanStateV3Schema = z.object({
  version: z.literal(3),
  profiles: z.object({
    reactFrontend: z.record(z.string(), ScanStateEntrySchema),
    nodejsBackend: z.record(z.string(), ScanStateEntrySchema),
  }),
});

const AppliedJobSchema = z.object({
  dedupeKey: z.string(),
  company: z.string(),
  title: z.string(),
  url: z.string(),
  appliedAt: z.string(),
  sourceReport: z.string().optional(),
});

const AppliedJobsStateV1Schema = z.object({
  version: z.literal(1),
  applied: z.record(z.string(), AppliedJobSchema),
});

const DismissedJobSchema = z.object({
  dedupeKey: z.string(),
  company: z.string(),
  title: z.string(),
  url: z.string(),
  dismissedAt: z.string(),
  sourceReport: z.string().optional(),
});

const ExpiredJobSchema = z.object({
  dedupeKey: z.string(),
  company: z.string(),
  title: z.string(),
  url: z.string(),
  expiredAt: z.string(),
  sourceReport: z.string().optional(),
});

const JobLifecycleStateV2Schema = z.object({
  version: z.literal(2),
  applied: z.record(z.string(), AppliedJobSchema),
  dismissed: z.record(z.string(), DismissedJobSchema),
  expired: z.record(z.string(), ExpiredJobSchema),
});

const LinkedInDiscoveryStateUnversionedSchema = z.object({
  lastRunAt: z.string().nullable(),
});

const LinkedInDiscoveryStateV1Schema = z.object({
  version: z.literal(1),
  lastRunAt: z.string().nullable(),
});

export class UnsupportedStateVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedStateVersionError";
  }
}

function ensureConfigDir(): void {
  if (!existsSync(REFINE_CV_CONFIG_DIR)) {
    mkdirSync(REFINE_CV_CONFIG_DIR, { recursive: true });
  }
}

function emptyProfileMaps(): Record<RoleProfile, Record<string, ScanStateEntry>> {
  return {
    reactFrontend: {},
    nodejsBackend: {},
  };
}

export function migrateScanState(raw: unknown): ScanState {
  if (raw === null || typeof raw !== "object") {
    throw new UnsupportedStateVersionError("Scan state must be a JSON object");
  }

  const version = (raw as { version?: unknown }).version;

  if (version === 3) {
    return ScanStateV3Schema.parse(raw);
  }

  if (version === 2) {
    const v2 = ScanStateV2Schema.parse(raw);
    return {
      version: 3,
      profiles: {
        reactFrontend: { ...v2.seen },
        nodejsBackend: {},
      },
    };
  }

  throw new UnsupportedStateVersionError(
    `Unsupported scan state version: ${String(version ?? "missing")}. Expected 2 or 3.`,
  );
}

export function migrateJobLifecycleState(raw: unknown): JobLifecycleState {
  if (raw === null || typeof raw !== "object") {
    throw new UnsupportedStateVersionError("Job lifecycle state must be a JSON object");
  }

  const version = (raw as { version?: unknown }).version;

  if (version === 2) {
    return JobLifecycleStateV2Schema.parse(raw);
  }

  if (version === 1) {
    const v1 = AppliedJobsStateV1Schema.parse(raw);
    return {
      version: 2,
      applied: { ...v1.applied },
      dismissed: {},
      expired: {},
    };
  }

  throw new UnsupportedStateVersionError(
    `Unsupported job lifecycle state version: ${String(version ?? "missing")}. Expected 1 or 2.`,
  );
}

export function migrateLinkedInDiscoveryState(raw: unknown): LinkedInDiscoveryState {
  if (raw === null || typeof raw !== "object") {
    throw new UnsupportedStateVersionError("LinkedIn discovery state must be a JSON object");
  }

  const version = (raw as { version?: unknown }).version;

  if (version === 1) {
    return LinkedInDiscoveryStateV1Schema.parse(raw);
  }

  if (version === undefined) {
    const unversioned = LinkedInDiscoveryStateUnversionedSchema.parse(raw);
    return { version: 1, lastRunAt: unversioned.lastRunAt };
  }

  throw new UnsupportedStateVersionError(
    `Unsupported LinkedIn discovery state version: ${String(version)}. Expected 1 or unversioned.`,
  );
}

export function getProfileSeenMap(
  state: ScanState,
  profile: RoleProfile,
): Record<string, ScanStateEntry> {
  return state.profiles[profile];
}

export function loadScanState(statePath: string = SCAN_STATE_PATH): ScanState {
  return loadPersistedState(
    statePath,
    migrateScanState,
    () => ({ version: 3, profiles: emptyProfileMaps() }),
  );
}

export function saveScanState(state: ScanState, statePath: string = SCAN_STATE_PATH): void {
  if (statePath === SCAN_STATE_PATH) {
    ensureConfigDir();
  }
  mkdirSync(dirname(statePath), { recursive: true });
  atomicWriteJson(statePath, state, { backup: true });
}

export function loadJobLifecycleState(
  statePath: string = APPLIED_JOBS_PATH,
): JobLifecycleState {
  return loadPersistedState(
    statePath,
    migrateJobLifecycleState,
    () => ({ version: 2, applied: {}, dismissed: {}, expired: {} }),
  );
}

/** @deprecated Use loadJobLifecycleState */
export function loadAppliedJobs(statePath: string = APPLIED_JOBS_PATH): AppliedJobsState {
  const lifecycle = loadJobLifecycleState(statePath);
  return { version: 1, applied: lifecycle.applied };
}

export function saveJobLifecycleState(
  state: JobLifecycleState,
  statePath: string = APPLIED_JOBS_PATH,
): void {
  if (statePath === APPLIED_JOBS_PATH) {
    ensureConfigDir();
  }
  mkdirSync(dirname(statePath), { recursive: true });
  atomicWriteJson(statePath, state, { backup: true });
}

/** @deprecated Use saveJobLifecycleState */
export function saveAppliedJobs(
  state: AppliedJobsState | JobLifecycleState,
  statePath: string = APPLIED_JOBS_PATH,
): void {
  if (state.version === 2) {
    saveJobLifecycleState(state, statePath);
    return;
  }

  saveJobLifecycleState(
    {
      version: 2,
      applied: state.applied,
      dismissed: {},
      expired: {},
    },
    statePath,
  );
}

export function updateScanState(
  state: ScanState,
  profile: RoleProfile,
  entries: ScanStateEntry[],
  observedAt: string = new Date().toISOString(),
): ScanState {
  const profiles = {
    reactFrontend: { ...state.profiles.reactFrontend },
    nodejsBackend: { ...state.profiles.nodejsBackend },
  };
  const seen = profiles[profile];

  for (const entry of entries) {
    const legacyDedupeKey = makeLegacyDedupeKey(entry.company, entry.title);
    const existing = findInStateMap(
      {
        dedupeKey: entry.dedupeKey,
        legacyDedupeKey,
        legacyUrlDedupeKey: makeLegacyUrlDedupeKey(entry.url),
        identityAliases: lifecycleKeys(entry),
      },
      seen,
    );

    if (existing && legacyDedupeKey !== entry.dedupeKey && seen[legacyDedupeKey]) {
      delete seen[legacyDedupeKey];
    }

    seen[entry.dedupeKey] = existing
      ? {
          ...existing,
          ...entry,
          firstSeenAt: existing.firstSeenAt,
          lastSeenAt: observedAt,
        }
      : { ...entry, lastSeenAt: observedAt };
  }

  return { version: 3, profiles };
}

export function lookupLifecycleDisposition(
  posting: Pick<
    JobPosting,
    "dedupeKey" | "legacyDedupeKey" | "legacyUrlDedupeKey" | "identityAliases"
  >,
  lifecycle: JobLifecycleState,
): JobLifecycleDisposition | null {
  if (findInStateMap(posting, lifecycle.applied)) {
    return "applied";
  }
  if (findInStateMap(posting, lifecycle.dismissed)) {
    return "dismissed";
  }
  if (findInStateMap(posting, lifecycle.expired)) {
    return "expired";
  }
  return null;
}

type LifecycleTransitionEntry =
  | AppliedJob
  | DismissedJob
  | ExpiredJob;

function lifecycleKeys(
  entry: Pick<LifecycleTransitionEntry, "dedupeKey" | "company" | "title" | "url">,
): string[] {
  const legacyUrl = makeLegacyUrlDedupeKey(entry.url);
  return [
    entry.dedupeKey,
    makeLegacyDedupeKey(entry.company, entry.title),
    ...(legacyUrl ? [legacyUrl] : []),
  ].filter((key, index, keys) => keys.indexOf(key) === index);
}

function findLifecycleEntry<T>(
  map: Record<string, T>,
  keys: string[],
): { key: string; entry: T } | undefined {
  for (const key of keys) {
    if (map[key]) {
      return { key, entry: map[key] };
    }
  }
  return undefined;
}

function withoutLifecycleKeys<T>(
  map: Record<string, T>,
  keys: string[],
): Record<string, T> {
  const next = { ...map };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

export function transitionJobLifecycle(
  state: JobLifecycleState,
  disposition: JobLifecycleDisposition,
  entry: LifecycleTransitionEntry,
): JobLifecycleState {
  const keys = lifecycleKeys(entry);
  const existingApplied = findLifecycleEntry(state.applied, keys);
  const existingDismissed = findLifecycleEntry(state.dismissed, keys);
  const existingExpired = findLifecycleEntry(state.expired, keys);
  const applied = withoutLifecycleKeys(state.applied, keys);
  const dismissed = withoutLifecycleKeys(state.dismissed, keys);
  const expired = withoutLifecycleKeys(state.expired, keys);

  if (disposition === "applied") {
    const appliedEntry = entry as AppliedJob;
    const key = existingApplied?.key ?? appliedEntry.dedupeKey;
    applied[key] = {
      ...appliedEntry,
      dedupeKey: key,
      appliedAt: existingApplied?.entry.appliedAt ?? appliedEntry.appliedAt,
    };
  } else if (disposition === "dismissed") {
    const dismissedEntry = entry as DismissedJob;
    const key = existingDismissed?.key ?? dismissedEntry.dedupeKey;
    dismissed[key] = {
      ...dismissedEntry,
      dedupeKey: key,
      dismissedAt:
        existingDismissed?.entry.dismissedAt ?? dismissedEntry.dismissedAt,
    };
  } else {
    const expiredEntry = entry as ExpiredJob;
    const key = existingExpired?.key ?? expiredEntry.dedupeKey;
    expired[key] = {
      ...expiredEntry,
      dedupeKey: key,
      expiredAt: existingExpired?.entry.expiredAt ?? expiredEntry.expiredAt,
    };
  }

  return { version: 2, applied, dismissed, expired };
}

export function markJobApplied(
  entry: Omit<AppliedJob, "appliedAt"> & { appliedAt?: string },
  statePath: string = APPLIED_JOBS_PATH,
): JobLifecycleState {
  const lifecycle = loadJobLifecycleState(statePath);
  const next = transitionJobLifecycle(lifecycle, "applied", {
    ...entry,
    appliedAt: entry.appliedAt ?? new Date().toISOString(),
  });
  saveJobLifecycleState(next, statePath);
  return next;
}

export function markJobDismissed(
  entry: Omit<DismissedJob, "dismissedAt"> & { dismissedAt?: string },
  statePath: string = APPLIED_JOBS_PATH,
): JobLifecycleState {
  const lifecycle = loadJobLifecycleState(statePath);
  const dismissedAt = entry.dismissedAt ?? new Date().toISOString();
  const next = transitionJobLifecycle(lifecycle, "dismissed", {
    ...entry,
    dismissedAt,
  });
  saveJobLifecycleState(next, statePath);
  return next;
}

export function markJobExpired(
  entry: Omit<ExpiredJob, "expiredAt"> & { expiredAt?: string },
  statePath: string = APPLIED_JOBS_PATH,
): JobLifecycleState {
  const lifecycle = loadJobLifecycleState(statePath);
  const expiredAt = entry.expiredAt ?? new Date().toISOString();
  const next = transitionJobLifecycle(lifecycle, "expired", {
    ...entry,
    expiredAt,
  });
  saveJobLifecycleState(next, statePath);
  return next;
}

export function parseAppliedCheckboxesFromReport(content: string, reportPath: string): AppliedJob[] {
  const applied: AppliedJob[] = [];
  const linePattern = /^- \[(x|X)\] (.+?) — (.+?) — (https?:\/\/\S+)/gm;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(content)) !== null) {
    const company = decodeHtmlEntities(unescapeMarkdownInline(match[2].trim()));
    const title = decodeHtmlEntities(unescapeMarkdownInline(match[3].trim()));
    const url = match[4].trim();
    const dedupeKey = makeLegacyDedupeKey(company, title);
    applied.push({
      dedupeKey,
      company,
      title,
      url,
      appliedAt: new Date().toISOString(),
      sourceReport: reportPath,
    });
  }

  return applied;
}

export function mergeAppliedFromReports(
  jobsDir: string,
  lifecyclePath: string = APPLIED_JOBS_PATH,
): JobLifecycleState {
  let lifecycle = loadJobLifecycleState(lifecyclePath);

  if (!existsSync(jobsDir)) {
    return lifecycle;
  }

  const scanDirs = listCompletedJobScanDirs(jobsDir);

  for (const dir of scanDirs) {
    const reportPath = join(dir, "report.md");
    if (!existsSync(reportPath)) {
      continue;
    }
    const content = readFileSync(reportPath, "utf8");
    const parsed = parseAppliedCheckboxesFromReport(content, reportPath);
    for (const job of parsed) {
      lifecycle = transitionJobLifecycle(lifecycle, "applied", job);
    }
  }

  return lifecycle;
}

export function saveMergedAppliedFromReports(
  jobsDir: string,
  lifecyclePath: string = APPLIED_JOBS_PATH,
): JobLifecycleState {
  const merged = mergeAppliedFromReports(jobsDir, lifecyclePath);
  saveJobLifecycleState(merged, lifecyclePath);
  return merged;
}

export function loadLinkedInDiscoveryState(
  statePath: string = LINKEDIN_DISCOVERY_STATE_PATH,
): LinkedInDiscoveryState {
  return loadPersistedState(
    statePath,
    migrateLinkedInDiscoveryState,
    () => ({ version: 1, lastRunAt: null }),
  );
}

export function saveLinkedInDiscoveryState(
  state: LinkedInDiscoveryState,
  statePath: string = LINKEDIN_DISCOVERY_STATE_PATH,
): void {
  if (statePath === LINKEDIN_DISCOVERY_STATE_PATH) {
    ensureConfigDir();
  }
  mkdirSync(dirname(statePath), { recursive: true });
  atomicWriteJson(statePath, state, { backup: true });
}
