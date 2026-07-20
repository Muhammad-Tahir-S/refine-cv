import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { makeLegacyDedupeKey } from "./dedupe.js";
import type { AppliedJob, AppliedJobsState, ScanState, ScanStateEntry } from "./types.js";

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

const ScanStateSchema = z.object({
  version: z.number(),
  seen: z.record(z.string(), ScanStateEntrySchema),
});

const AppliedJobSchema = z.object({
  dedupeKey: z.string(),
  company: z.string(),
  title: z.string(),
  url: z.string(),
  appliedAt: z.string(),
  sourceReport: z.string().optional(),
});

const AppliedJobsStateSchema = z.object({
  version: z.number(),
  applied: z.record(z.string(), AppliedJobSchema),
});

function ensureConfigDir(): void {
  if (!existsSync(REFINE_CV_CONFIG_DIR)) {
    mkdirSync(REFINE_CV_CONFIG_DIR, { recursive: true });
  }
}

export function loadScanState(statePath: string = SCAN_STATE_PATH): ScanState {
  ensureConfigDir();
  if (!existsSync(statePath)) {
    return { version: 2, seen: {} };
  }
  return ScanStateSchema.parse(JSON.parse(readFileSync(statePath, "utf8")));
}

export function saveScanState(state: ScanState, statePath: string = SCAN_STATE_PATH): void {
  ensureConfigDir();
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function loadAppliedJobs(): AppliedJobsState {
  ensureConfigDir();
  if (!existsSync(APPLIED_JOBS_PATH)) {
    return { version: 1, applied: {} };
  }
  return AppliedJobsStateSchema.parse(
    JSON.parse(readFileSync(APPLIED_JOBS_PATH, "utf8")),
  );
}

export function saveAppliedJobs(state: AppliedJobsState): void {
  ensureConfigDir();
  writeFileSync(APPLIED_JOBS_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

export function updateScanState(
  state: ScanState,
  entries: ScanStateEntry[],
): ScanState {
  const now = new Date().toISOString();
  const seen = { ...state.seen };

  for (const entry of entries) {
    const existing = seen[entry.dedupeKey];
    seen[entry.dedupeKey] = existing
      ? { ...existing, lastSeenAt: now, url: entry.url }
      : { ...entry, firstSeenAt: now, lastSeenAt: now };
  }

  return { version: 2, seen };
}

export function parseAppliedCheckboxesFromReport(content: string, reportPath: string): AppliedJob[] {
  const applied: AppliedJob[] = [];
  const linePattern = /^- \[(x|X)\] (.+?) — (.+?) — (https?:\/\/\S+)/gm;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(content)) !== null) {
    const company = match[2].trim();
    const title = match[3].trim();
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

export function mergeAppliedFromReports(jobsDir: string): AppliedJobsState {
  const state = loadAppliedJobs();
  const applied = { ...state.applied };

  if (!existsSync(jobsDir)) {
    return state;
  }

  const scanDirs = readdirSync(jobsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.includes("job-scan"))
    .map((entry) => join(jobsDir, entry.name));

  for (const dir of scanDirs) {
    const reportPath = join(dir, "report.md");
    if (!existsSync(reportPath)) {
      continue;
    }
    const content = readFileSync(reportPath, "utf8");
    const parsed = parseAppliedCheckboxesFromReport(content, reportPath);
    for (const job of parsed) {
      applied[job.dedupeKey] = job;
    }
  }

  return { version: 1, applied };
}

export function saveMergedAppliedFromReports(jobsDir: string): AppliedJobsState {
  const merged = mergeAppliedFromReports(jobsDir);
  saveAppliedJobs(merged);
  return merged;
}
