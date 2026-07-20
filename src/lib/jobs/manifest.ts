import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, relative } from "node:path";
import { z } from "zod";
import { paths } from "../paths.js";
import { SCAN_ARTIFACT_NAMES } from "./artifact-names.js";
import { PROFILE_OPTION_FIELDS } from "./sources/source-options.js";
import type { SerializedScanPolicy } from "./scan-policy.js";
import type {
  DedupeSummary,
  JobSourceEntry,
  JobSourceId,
  LifecycleSuppressedCounts,
  QuarantineDiagnostics,
  ScanRunOutcome,
  ScanRunResult,
  SourceFetchError,
  SourceStats,
} from "./types.js";

export const RUN_MANIFEST_SCHEMA_VERSION = 1 as const;

export type RunOutcomeStatus =
  | "success"
  | "partial"
  | "total_outage"
  | "all_cadence_skipped";

export interface ConfigFingerprint {
  label: string;
  sha256: string;
}

export interface RunManifestSource {
  configuredSourceId: string;
  adapter: string;
  status: SourceStats["status"];
  skipReason?: string;
  attribution: string;
  minPollHours: number;
  effectiveProfileOptions: Record<string, unknown>;
  requestUrls: string[];
  attemptedAt?: string;
  completedAt?: string;
  durationMs: number;
  fetched: number;
  normalized: number;
  quarantined: number;
  matched: number;
  quarantineDiagnostics?: QuarantineDiagnostics;
  fetchError?: {
    message: string;
    status?: number;
    attempts?: number;
    retryable?: boolean;
  };
}

export interface RunManifest {
  schemaVersion: typeof RUN_MANIFEST_SCHEMA_VERSION;
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  application: {
    version: string;
    gitCommit?: string;
  };
  policy: SerializedScanPolicy;
  configs: {
    jobSearch: ConfigFingerprint;
    jobSources: ConfigFingerprint;
  };
  forcePoll: boolean;
  sourceConfigVersion: number;
  sources: RunManifestSource[];
  pipeline: {
    blocklistExcluded: number;
    dedupe: DedupeSummary;
    exclusionsByReason: Record<string, number>;
    lifecycleSuppressed: LifecycleSuppressedCounts;
    policyMatched: number;
    activeMatched: number;
    newJobs: number;
    previouslySeen: number;
  };
  outcome: {
    status: RunOutcomeStatus;
    attemptedSources: number;
    skippedSources: number;
    succeededSources: number;
    failedSources: number;
  };
  artifacts: {
    report: string;
    scanResult: string;
    manifest: string;
  };
}

export interface RunEnvironmentMetadata {
  applicationVersion: string;
  gitCommit?: string;
  jobSearchConfig: ConfigFingerprint;
  jobSourcesConfig: ConfigFingerprint;
  sourceConfigVersion: number;
}

export interface RunManifestMetadataReader {
  readApplicationVersion(): string;
  readGitCommit(): string | undefined;
  readJobSearchConfig(configPath: string): ConfigFingerprint;
  readJobSourcesConfig(configPath: string): ConfigFingerprint & { version: number };
}

const IsoTimestampSchema = z.string().datetime({ offset: true });
const CountSchema = z.number().int().nonnegative();
const SafeHttpUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Expected an http(s) URL");
const ConfigFingerprintSchema = z.object({
  label: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const QuarantineDiagnosticsSchema = z.object({
  total: CountSchema,
  byReason: z.record(z.string(), z.number().int().nonnegative()),
  byCategory: z.record(z.string(), z.number().int().nonnegative()),
  samples: z.array(z.object({
    index: CountSchema,
    identifier: z.string().optional(),
    title: z.string().optional(),
  }).strict()).max(5),
}).strict();
const RunManifestSourceSchema = z.object({
  configuredSourceId: z.string().min(1),
  adapter: z.string().min(1),
  status: z.enum(["success", "failure", "skipped"]),
  skipReason: z.string().optional(),
  attribution: z.string().min(1),
  minPollHours: CountSchema,
  effectiveProfileOptions: z.record(z.string(), z.unknown()),
  requestUrls: z.array(SafeHttpUrlSchema),
  attemptedAt: IsoTimestampSchema.optional(),
  completedAt: IsoTimestampSchema.optional(),
  durationMs: CountSchema,
  fetched: CountSchema,
  normalized: CountSchema,
  quarantined: CountSchema,
  matched: CountSchema,
  quarantineDiagnostics: QuarantineDiagnosticsSchema.optional(),
  fetchError: z.object({
    message: z.string(),
    status: z.number().int().optional(),
    attempts: CountSchema.optional(),
    retryable: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export const RunManifestSchema = z.object({
  schemaVersion: z.literal(RUN_MANIFEST_SCHEMA_VERSION),
  runId: z.string().min(1),
  startedAt: IsoTimestampSchema,
  completedAt: IsoTimestampSchema,
  durationMs: CountSchema,
  application: z.object({
    version: z.string().min(1),
    gitCommit: z.string().regex(/^[a-fA-F0-9]{7,64}$/).optional(),
  }).strict(),
  policy: z.object({
    configLabel: z.string().min(1),
    roleProfile: z.enum(["reactFrontend", "nodejsBackend"]),
    roleProfileLabel: z.string().min(1),
    allowedLevels: z.array(z.enum(["junior", "mid", "senior", "staff_lead", "unknown"])),
    geo: z.object({
      acceptGlobalRemote: z.boolean(),
      acceptEmeaOnlyWhenAfricaMentioned: z.boolean(),
      defaultEmeaToVerify: z.boolean(),
      summary: z.string(),
    }).strict(),
    applicant: z.object({
      location: z.string(),
      citizenship: z.string(),
      workPermitCountries: z.array(z.string()),
      name: z.string().optional(),
    }).strict(),
    blocklistCount: CountSchema,
  }).strict(),
  configs: z.object({
    jobSearch: ConfigFingerprintSchema,
    jobSources: ConfigFingerprintSchema,
  }).strict(),
  forcePoll: z.boolean(),
  sourceConfigVersion: CountSchema,
  sources: z.array(RunManifestSourceSchema),
  pipeline: z.object({
    blocklistExcluded: CountSchema,
    dedupe: z.object({
      inputCount: CountSchema,
      outputCount: CountSchema,
      mergedCount: CountSchema,
    }).strict(),
    exclusionsByReason: z.record(z.string(), CountSchema),
    lifecycleSuppressed: z.object({
      applied: CountSchema,
      dismissed: CountSchema,
      expired: CountSchema,
    }).strict(),
    policyMatched: CountSchema,
    activeMatched: CountSchema,
    newJobs: CountSchema,
    previouslySeen: CountSchema,
  }).strict(),
  outcome: z.object({
    status: z.enum(["success", "partial", "total_outage", "all_cadence_skipped"]),
    attemptedSources: CountSchema,
    skippedSources: CountSchema,
    succeededSources: CountSchema,
    failedSources: CountSchema,
  }).strict(),
  artifacts: z.object({
    report: z.string().min(1),
    scanResult: z.string().min(1),
    manifest: z.string().min(1),
  }).strict(),
}).strict();

const MAX_ARTIFACT_STRING_LENGTH = 4096;
const HTTP_URL_PATTERN = /https?:\/\/[^\s"'`<>]+/gi;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /[A-Za-z]:[\\/](?:[^\s"'`<>|]+[\\/]?)+/g;
const WINDOWS_UNC_PATH_PATTERN = /\\\\[^\\\s"'`<>|]+\\[^\\\s"'`<>|]+(?:\\[^\s"'`<>|]+)*/g;
const POSIX_ABSOLUTE_PATH_PATTERN =
  /(^|[\s"'`(=:\[])\/(?:[^\s"'`<>|/]+\/)*[^\s"'`<>|]*/g;

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function repoRelativeConfigLabel(configPath: string, root = paths.root): string {
  if (configPath.endsWith("job-search-nodejs-backend.json")) {
    return "config/job-search-nodejs-backend.json";
  }
  if (configPath.endsWith("job-search.json")) {
    return "config/job-search.json";
  }
  if (configPath.endsWith("job-sources.json")) {
    return "config/job-sources.json";
  }

  const rel = relative(root, configPath);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
    return rel.replaceAll("\\", "/");
  }
  return basename(configPath);
}

export interface GitRevisionReaderOptions {
  env?: NodeJS.ProcessEnv;
  runGit?: (root: string) => string;
}

function defaultRunGit(root: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    timeout: 1500,
    maxBuffer: 1024,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function readGitCommitSafely(
  root = paths.root,
  options: GitRevisionReaderOptions = {},
): string | undefined {
  const env = options.env ?? process.env;
  const environmentSha = [
    env.REFINE_CV_GIT_SHA,
    env.GITHUB_SHA,
    env.CI_COMMIT_SHA,
    env.SOURCE_VERSION,
  ].find((value) => typeof value === "string" && /^[a-fA-F0-9]{7,64}$/.test(value));
  if (environmentSha) {
    return environmentSha;
  }

  try {
    const revision = (options.runGit ?? defaultRunGit)(root);
    return /^[a-fA-F0-9]{7,64}$/.test(revision) ? revision : undefined;
  } catch {
    return undefined;
  }
}

export function readPackageVersionSafely(root = paths.root): string {
  try {
    const packagePath = `${root}/package.json`;
    if (!existsSync(packagePath)) {
      return "unknown";
    }
    const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}

export function createDefaultRunManifestMetadataReader(
  root = paths.root,
): RunManifestMetadataReader {
  return {
    readApplicationVersion: () => readPackageVersionSafely(root),
    readGitCommit: () => readGitCommitSafely(root),
    readJobSearchConfig: (configPath: string) => {
      const bytes = readFileSync(configPath, "utf8");
      return {
        label: repoRelativeConfigLabel(configPath, root),
        sha256: sha256Hex(bytes),
      };
    },
    readJobSourcesConfig: (configPath: string) => {
      const bytes = readFileSync(configPath, "utf8");
      const parsed = JSON.parse(bytes) as { version?: unknown };
      return {
        label: repoRelativeConfigLabel(configPath, root),
        sha256: sha256Hex(bytes),
        version: typeof parsed.version === "number" ? parsed.version : 0,
      };
    },
  };
}

export function deriveRunOutcomeStatus(outcome: ScanRunOutcome): RunOutcomeStatus {
  if (outcome.allSkippedDueToCadence) {
    return "all_cadence_skipped";
  }
  if (outcome.totalSourceOutage) {
    return "total_outage";
  }
  if (outcome.failedSources > 0) {
    return "partial";
  }
  return "success";
}

export function groupExclusionsByReason(
  excluded: Array<{ reason: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { reason } of excluded) {
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
}

function pickEffectiveProfileOptions(source: JobSourceEntry): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const field of PROFILE_OPTION_FIELDS) {
    const value = source[field];
    if (value !== undefined) {
      options[field] = value;
    }
  }
  return options;
}

function attributionForSource(
  source: JobSourceEntry,
  attributionBySourceId: Map<string, string>,
  globalAttribution?: string,
): string {
  return (
    attributionBySourceId.get(source.id) ??
    source.attribution ??
    globalAttribution ??
    "Public job board listing"
  );
}

export function buildRunManifestSource(
  stat: SourceStats,
  sourceEntry: JobSourceEntry | undefined,
  attributionBySourceId: Map<string, string>,
  globalAttribution?: string,
  fetchError?: SourceFetchError,
): RunManifestSource {
  const requestUrls =
    stat.requestUrls ??
    (stat.requestUrl ? [stat.requestUrl] : []);
  const manifestSource: RunManifestSource = {
    configuredSourceId: stat.sourceId,
    adapter: stat.adapter,
    status: stat.status,
    skipReason: stat.skipReason,
    attribution: sourceEntry
      ? attributionForSource(sourceEntry, attributionBySourceId, globalAttribution)
      : (attributionBySourceId.get(stat.sourceId) ?? "Public job board listing"),
    minPollHours: sourceEntry?.minPollHours ?? 0,
    effectiveProfileOptions: sourceEntry ? pickEffectiveProfileOptions(sourceEntry) : {},
    requestUrls,
    attemptedAt: stat.attemptedAt,
    completedAt: stat.completedAt,
    durationMs: stat.durationMs,
    fetched: stat.fetched,
    normalized: stat.normalized,
    quarantined: stat.quarantined,
    matched: stat.matched,
    quarantineDiagnostics: stat.quarantineDiagnostics,
  };

  if (fetchError) {
    manifestSource.fetchError = {
      message: fetchError.error,
      status: fetchError.status,
      attempts: fetchError.attempts,
      retryable: fetchError.retryable,
    };
  }

  return manifestSource;
}

export interface BuildRunManifestInput {
  result: ScanRunResult;
  startedAt: string;
  completedAt: string;
  forcePoll: boolean;
  sourceEntries: JobSourceEntry[];
  globalAttribution?: string;
  metadata: RunEnvironmentMetadata;
}

export function buildRunManifest(input: BuildRunManifestInput): RunManifest {
  const { result, startedAt, completedAt, forcePoll, sourceEntries, globalAttribution, metadata } =
    input;
  const durationMs = Math.max(
    0,
    Date.parse(completedAt) - Date.parse(startedAt),
  );
  const sourceById = new Map(sourceEntries.map((entry) => [entry.id, entry]));
  const attributionBySourceId = new Map(
    sourceEntries.map((entry) => [
      entry.id,
      attributionForSource(entry, new Map(), globalAttribution),
    ]),
  );
  const fetchErrorsBySourceId = new Map(
    result.fetchErrors.map((error) => [error.sourceId, error]),
  );

  return {
    schemaVersion: RUN_MANIFEST_SCHEMA_VERSION,
    runId: result.runId,
    startedAt,
    completedAt,
    durationMs,
    application: {
      version: metadata.applicationVersion,
      gitCommit: metadata.gitCommit,
    },
    policy: result.policy,
    configs: {
      jobSearch: metadata.jobSearchConfig,
      jobSources: metadata.jobSourcesConfig,
    },
    forcePoll,
    sourceConfigVersion: metadata.sourceConfigVersion,
    sources: result.sourceStats.map((stat) =>
      buildRunManifestSource(
        stat,
        sourceById.get(stat.sourceId),
        attributionBySourceId,
        globalAttribution,
        fetchErrorsBySourceId.get(stat.sourceId),
      ),
    ),
    pipeline: {
      blocklistExcluded: result.blocklistExcluded,
      dedupe: result.dedupeSummary,
      exclusionsByReason: result.exclusionsByReason,
      lifecycleSuppressed: result.lifecycleSuppressed,
      policyMatched: result.policyMatched,
      activeMatched: result.allMatched.length,
      newJobs: result.newJobs.length,
      previouslySeen: result.previouslySeen.length,
    },
    outcome: {
      status: deriveRunOutcomeStatus(result.outcome),
      attemptedSources: result.outcome.attemptedSources,
      skippedSources: result.outcome.skippedSources,
      succeededSources: result.outcome.succeededSources,
      failedSources: result.outcome.failedSources,
    },
    artifacts: {
      report: SCAN_ARTIFACT_NAMES.report,
      scanResult: SCAN_ARTIFACT_NAMES.scanResult,
      manifest: SCAN_ARTIFACT_NAMES.manifest,
    },
  };
}

function sanitizeUrlForArtifact(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.href;
  } catch {
    return value;
  }
}

export function redactSensitivePaths(value: string): string {
  const urls: string[] = [];
  let redacted = value.replace(HTTP_URL_PATTERN, (url) => {
    const token = `__REFINE_CV_URL_${urls.length}__`;
    urls.push(sanitizeUrlForArtifact(url));
    return token;
  });
  redacted = redacted.replace(WINDOWS_ABSOLUTE_PATH_PATTERN, "[redacted-path]");
  redacted = redacted.replace(WINDOWS_UNC_PATH_PATTERN, "[redacted-path]");
  redacted = redacted.replace(
    POSIX_ABSOLUTE_PATH_PATTERN,
    (_match, prefix: string) => `${prefix}[redacted-path]`,
  );
  redacted = redacted.replace(/(?:~[\\/])?[.]config[\\/]refine-cv[\\/][^\s"'`<>|]*/g, "[redacted-path]");
  redacted = redacted.replace(/job-scan\.lock/g, "[redacted-path]");
  for (let index = 0; index < urls.length; index += 1) {
    redacted = redacted.replace(`__REFINE_CV_URL_${index}__`, urls[index]);
  }
  return redacted.length <= MAX_ARTIFACT_STRING_LENGTH
    ? redacted
    : `${redacted.slice(0, MAX_ARTIFACT_STRING_LENGTH - 1)}…`;
}

function containsSensitivePath(value: string): boolean {
  const withoutUrls = value.replace(HTTP_URL_PATTERN, "");
  WINDOWS_ABSOLUTE_PATH_PATTERN.lastIndex = 0;
  WINDOWS_UNC_PATH_PATTERN.lastIndex = 0;
  POSIX_ABSOLUTE_PATH_PATTERN.lastIndex = 0;
  return (
    WINDOWS_ABSOLUTE_PATH_PATTERN.test(withoutUrls) ||
    WINDOWS_UNC_PATH_PATTERN.test(withoutUrls) ||
    POSIX_ABSOLUTE_PATH_PATTERN.test(withoutUrls) ||
    /(?:~[\\/])?[.]config[\\/]refine-cv/.test(withoutUrls) ||
    /job-scan\.lock/.test(withoutUrls)
  );
}

export function assertNoSensitivePaths(value: unknown, path = "$"): void {
  if (typeof value === "string") {
    if (containsSensitivePath(value)) {
      throw new Error(`Sensitive path detected at ${path}: ${value}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertNoSensitivePaths(value[index], `${path}[${index}]`);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      assertNoSensitivePaths(nested, `${path}.${key}`);
    }
  }
}

export function sanitizeForScanArtifact(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: redactSensitivePaths(value.name),
      message: redactSensitivePaths(value.message),
    };
  }

  if (typeof value === "string") {
    return redactSensitivePaths(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForScanArtifact(item));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (key === "outputDir") {
        continue;
      }
      output[key] = sanitizeForScanArtifact(nested);
    }
    return output;
  }

  return value;
}

export function serializeScanResult(result: ScanRunResult): string {
  const payload = sanitizeForScanArtifact({
    ...result,
    outputDir: undefined,
  });
  assertNoSensitivePaths(payload);
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function serializeRunManifest(manifest: RunManifest): string {
  const payload = sanitizeForScanArtifact(manifest);
  assertNoSensitivePaths(payload);
  const validated = RunManifestSchema.parse(payload);
  return `${JSON.stringify(validated, null, 2)}\n`;
}

export const BOARD_DISPLAY_NAMES: Record<JobSourceId, string> = {
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  remotive: "Remotive",
  arbeitnow: "Arbeitnow",
  remoteok: "Remote OK",
  wwr: "We Work Remotely",
  "hn-hiring": "Hacker News Who is Hiring",
  linkedin: "LinkedIn",
};

export function boardDisplayName(adapter: string): string {
  return BOARD_DISPLAY_NAMES[adapter as JobSourceId] ?? adapter;
}

export function readRunEnvironmentMetadata(
  jobSearchConfigPath: string,
  jobSourcesConfigPath: string,
  reader: RunManifestMetadataReader = createDefaultRunManifestMetadataReader(),
): RunEnvironmentMetadata {
  const jobSearchConfig = reader.readJobSearchConfig(jobSearchConfigPath);
  const jobSourcesConfig = reader.readJobSourcesConfig(jobSourcesConfigPath);
  return {
    applicationVersion: reader.readApplicationVersion(),
    gitCommit: reader.readGitCommit(),
    jobSearchConfig,
    jobSourcesConfig: {
      label: jobSourcesConfig.label,
      sha256: jobSourcesConfig.sha256,
    },
    sourceConfigVersion: jobSourcesConfig.version,
  };
}
