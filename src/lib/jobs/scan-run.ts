import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, join } from "node:path";
import { randomBytes } from "node:crypto";
import { SCAN_ARTIFACT_NAMES } from "./artifact-names.js";
import {
  atomicWriteFile,
  atomicWriteJson,
  fsyncDirectory,
} from "./persistence.js";
import type { RoleProfile } from "./role-profile.js";

export const STAGING_DIR_PREFIX = ".staging-";

export interface LatestRunPointerV1 {
  version: 1;
  runId: string;
  roleProfile: RoleProfile;
  outputDir: string;
  publishedAt: string;
}

export interface LatestRunPointerV2 {
  version: 2;
  runId: string;
  roleProfile: RoleProfile;
  runDirName: string;
  artifacts: {
    report: string;
    scanResult: string;
    manifest: string;
  };
  publishedAt: string;
}

export type LatestRunPointer = LatestRunPointerV1 | LatestRunPointerV2;

export interface BuildScanRunIdOptions {
  now?: () => Date;
  randomSuffix?: () => string;
}

export function roleProfileSlug(profile: RoleProfile): string {
  return profile === "nodejsBackend" ? "nodejs-backend" : "react-frontend";
}

export function formatUtcRunTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function defaultRandomSuffix(): string {
  return randomBytes(3).toString("hex");
}

export function buildScanRunId(
  profile: RoleProfile,
  now: () => Date = () => new Date(),
  randomSuffix: () => string = defaultRandomSuffix,
): string {
  const timestamp = formatUtcRunTimestamp(now());
  return `${timestamp}-${roleProfileSlug(profile)}-${randomSuffix()}`;
}

export function scanRunDirName(runId: string): string {
  return `${runId}-job-scan`;
}

export function stagingDirName(runId: string): string {
  return `${STAGING_DIR_PREFIX}${scanRunDirName(runId)}`;
}

export function isJobScanDirName(name: string): boolean {
  if (name.startsWith(STAGING_DIR_PREFIX) || name.startsWith(".")) {
    return false;
  }
  return name.endsWith("-job-scan");
}

export function latestRunPointerPath(jobsDir: string, profile: RoleProfile): string {
  return join(jobsDir, `.latest-${roleProfileSlug(profile)}-job-scan.json`);
}

export function resolveUniqueRunPaths(
  jobsDir: string,
  profile: RoleProfile,
  options: BuildScanRunIdOptions = {},
): { runId: string; finalDirName: string; finalOutputDir: string; stagingOutputDir: string } {
  const now = options.now ?? (() => new Date());
  const randomSuffix = options.randomSuffix ?? defaultRandomSuffix;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const runId = buildScanRunId(profile, now, randomSuffix);
    const finalDirName = scanRunDirName(runId);
    const finalOutputDir = join(jobsDir, finalDirName);
    const stagingOutputDir = join(jobsDir, stagingDirName(runId));

    if (!existsSync(finalOutputDir) && !existsSync(stagingOutputDir)) {
      return { runId, finalDirName, finalOutputDir, stagingOutputDir };
    }
  }

  throw new Error(`Unable to allocate a unique scan run directory under ${jobsDir}.`);
}

export interface PublishScanArtifactsInput {
  jobsDir: string;
  runId: string;
  finalOutputDir: string;
  stagingOutputDir: string;
  scanResultJson: string;
  reportMarkdown: string;
  manifestJson: string;
  publishedAt?: string;
  writeAtomicFile?: typeof atomicWriteFile;
  renameDir?: (from: string, to: string) => void;
  removeDir?: (path: string) => void;
  syncDirectory?: (directoryPath: string) => void;
}

export function publishScanArtifacts(input: PublishScanArtifactsInput): void {
  const writeAtomicFile = input.writeAtomicFile ?? atomicWriteFile;
  const renameDir = input.renameDir ?? renameSync;
  const removeDir = input.removeDir ?? ((path: string) => rmSync(path, { recursive: true, force: true }));
  const syncDirectory = input.syncDirectory ?? fsyncDirectory;

  mkdirSync(input.jobsDir, { recursive: true });

  if (existsSync(input.stagingOutputDir)) {
    removeDir(input.stagingOutputDir);
  }
  if (existsSync(input.finalOutputDir)) {
    throw new Error(`Refusing to publish scan run; final directory already exists: ${input.finalOutputDir}`);
  }

  mkdirSync(input.stagingOutputDir, { recursive: true });

  try {
    writeAtomicFile(
      join(input.stagingOutputDir, SCAN_ARTIFACT_NAMES.scanResult),
      input.scanResultJson,
      { backup: false },
    );
    writeAtomicFile(
      join(input.stagingOutputDir, SCAN_ARTIFACT_NAMES.report),
      input.reportMarkdown,
      { backup: false },
    );
    writeAtomicFile(
      join(input.stagingOutputDir, SCAN_ARTIFACT_NAMES.manifest),
      input.manifestJson,
      { backup: false },
    );
    renameDir(input.stagingOutputDir, input.finalOutputDir);
    syncDirectory(input.jobsDir);
  } catch (error) {
    if (existsSync(input.stagingOutputDir)) {
      removeDir(input.stagingOutputDir);
    }
    throw error;
  }
}

export function writeLatestRunPointer(
  jobsDir: string,
  profile: RoleProfile,
  pointer: Omit<LatestRunPointerV2, "version" | "roleProfile" | "artifacts"> & {
    runDirName: string;
    artifacts?: LatestRunPointerV2["artifacts"];
  },
  writeAtomic: typeof atomicWriteJson = atomicWriteJson,
): void {
  const payload: LatestRunPointerV2 = {
    version: 2,
    roleProfile: profile,
    runId: pointer.runId,
    runDirName: pointer.runDirName,
    artifacts: pointer.artifacts ?? {
      report: SCAN_ARTIFACT_NAMES.report,
      scanResult: SCAN_ARTIFACT_NAMES.scanResult,
      manifest: SCAN_ARTIFACT_NAMES.manifest,
    },
    publishedAt: pointer.publishedAt,
  };
  if (!parseLatestRunPointer(payload, profile)) {
    throw new Error("Refusing to write an invalid latest-run pointer.");
  }
  writeAtomic(latestRunPointerPath(jobsDir, profile), payload, { backup: true });
}

function isValidTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isValidRunId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{8}T\d{6}Z-(?:react-frontend|nodejs-backend)-[A-Za-z0-9]+$/.test(value)
  );
}

function isSafeBasename(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    basename(value) === value
  );
}

function hasValidRoleProfile(
  value: unknown,
  expectedProfile: RoleProfile,
): value is RoleProfile {
  return value === expectedProfile;
}

export function parseLatestRunPointer(
  raw: unknown,
  expectedProfile: RoleProfile,
): LatestRunPointer | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const version = (raw as { version?: unknown }).version;
  if (version === 2) {
    const pointer = raw as LatestRunPointerV2;
    if (
      isValidRunId(pointer.runId) &&
      isSafeBasename(pointer.runDirName) &&
      pointer.runDirName === scanRunDirName(pointer.runId) &&
      isJobScanDirName(pointer.runDirName) &&
      hasValidRoleProfile(pointer.roleProfile, expectedProfile) &&
      isValidTimestamp(pointer.publishedAt) &&
      pointer.artifacts &&
      isSafeBasename(pointer.artifacts.report) &&
      isSafeBasename(pointer.artifacts.scanResult) &&
      isSafeBasename(pointer.artifacts.manifest)
    ) {
      return pointer;
    }
    return null;
  }

  if (version === 1) {
    const pointer = raw as LatestRunPointerV1;
    const outputDirName =
      typeof pointer.outputDir === "string" ? basename(pointer.outputDir) : "";
    if (
      isValidRunId(pointer.runId) &&
      isJobScanDirName(outputDirName) &&
      outputDirName === scanRunDirName(pointer.runId) &&
      hasValidRoleProfile(pointer.roleProfile, expectedProfile) &&
      isValidTimestamp(pointer.publishedAt)
    ) {
      return pointer;
    }
  }

  return null;
}

export function resolveRunDirectory(jobsDir: string, pointer: LatestRunPointer): string {
  if (pointer.version === 2) {
    return join(jobsDir, pointer.runDirName);
  }
  return join(jobsDir, basename(pointer.outputDir));
}

export function readLatestRunPointer(
  jobsDir: string,
  profile: RoleProfile,
): LatestRunPointer | null {
  const pointerPath = latestRunPointerPath(jobsDir, profile);
  if (!existsSync(pointerPath)) {
    return null;
  }

  try {
    return parseLatestRunPointer(
      JSON.parse(readFileSync(pointerPath, "utf8")) as unknown,
      profile,
    );
  } catch {
    return null;
  }
}

export function listCompletedJobScanDirs(jobsDir: string): string[] {
  if (!existsSync(jobsDir)) {
    return [];
  }

  return readdirSync(jobsDir, { withFileTypes: true })
    .filter((entry) => {
      if (
        !entry.isDirectory() ||
        entry.name.startsWith(STAGING_DIR_PREFIX) ||
        entry.name.startsWith(".")
      ) {
        return false;
      }
      if (isJobScanDirName(entry.name)) {
        return true;
      }

      const reportPath = join(jobsDir, entry.name, SCAN_ARTIFACT_NAMES.report);
      if (!existsSync(reportPath)) {
        return false;
      }
      return readFileSync(reportPath, "utf8").startsWith("# Job Scan Report");
    })
    .map((entry) => join(jobsDir, entry.name));
}

export function resolveLinkedInDiscoveryOutputPath(
  jobsDir: string,
  profile: RoleProfile,
  explicitPath?: string,
  options: BuildScanRunIdOptions = {},
): string {
  if (explicitPath) {
    return explicitPath;
  }

  const latest = readLatestRunPointer(jobsDir, profile);
  if (latest) {
    return join(resolveRunDirectory(jobsDir, latest), "linkedin-discovery.md");
  }

  const { finalOutputDir } = resolveUniqueRunPaths(jobsDir, profile, options);
  return join(finalOutputDir, "linkedin-discovery.md");
}

export function migrateLatestRunPointerV1ToV2(
  pointer: LatestRunPointerV1,
): LatestRunPointerV2 {
  return {
    version: 2,
    runId: pointer.runId,
    roleProfile: pointer.roleProfile,
    runDirName: basename(pointer.outputDir),
    artifacts: {
      report: SCAN_ARTIFACT_NAMES.report,
      scanResult: SCAN_ARTIFACT_NAMES.scanResult,
      manifest: SCAN_ARTIFACT_NAMES.manifest,
    },
    publishedAt: pointer.publishedAt,
  };
}

/** @deprecated Legacy artifact name — use scan-result.json for new runs. */
export const LEGACY_SCAN_RESULT_ARTIFACT = "raw.json";
