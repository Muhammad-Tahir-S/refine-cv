import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  atomicWriteFile,
  atomicWriteJson,
  fsyncDirectory,
} from "./persistence.js";
import type { RoleProfile } from "./role-profile.js";

export const STAGING_DIR_PREFIX = ".staging-";

export interface LatestRunPointer {
  version: 1;
  runId: string;
  roleProfile: RoleProfile;
  outputDir: string;
  publishedAt: string;
}

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
  rawJson: string;
  reportMarkdown: string;
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
    writeAtomicFile(join(input.stagingOutputDir, "raw.json"), input.rawJson, { backup: false });
    writeAtomicFile(join(input.stagingOutputDir, "report.md"), input.reportMarkdown, {
      backup: false,
    });
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
  pointer: Omit<LatestRunPointer, "version" | "roleProfile">,
  writeAtomic: typeof atomicWriteJson = atomicWriteJson,
): void {
  const payload: LatestRunPointer = {
    version: 1,
    roleProfile: profile,
    runId: pointer.runId,
    outputDir: pointer.outputDir,
    publishedAt: pointer.publishedAt,
  };
  writeAtomic(latestRunPointerPath(jobsDir, profile), payload, { backup: true });
}

export function readLatestRunPointer(
  jobsDir: string,
  profile: RoleProfile,
): LatestRunPointer | null {
  const pointerPath = latestRunPointerPath(jobsDir, profile);
  if (!existsSync(pointerPath)) {
    return null;
  }

  const raw = JSON.parse(readFileSync(pointerPath, "utf8")) as unknown;
  if (
    raw &&
    typeof raw === "object" &&
    (raw as LatestRunPointer).version === 1 &&
    typeof (raw as LatestRunPointer).outputDir === "string"
  ) {
    return raw as LatestRunPointer;
  }

  return null;
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

      const reportPath = join(jobsDir, entry.name, "report.md");
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
    return join(latest.outputDir, "linkedin-discovery.md");
  }

  const { finalOutputDir } = resolveUniqueRunPaths(jobsDir, profile, options);
  return join(finalOutputDir, "linkedin-discovery.md");
}
