import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { REFINE_CV_CONFIG_DIR } from "./state.js";
import type { RoleProfile } from "./role-profile.js";

export const DEFAULT_SCAN_LOCK_PATH = join(REFINE_CV_CONFIG_DIR, "job-scan.lock");
export const DEFAULT_MALFORMED_LOCK_STALE_MS = 5 * 60 * 1000;

const ScanLockMetadataSchema = z.object({
  version: z.literal(1),
  pid: z.number().int().positive(),
  profile: z.enum(["reactFrontend", "nodejsBackend"]),
  startedAt: z.string(),
  host: z.string(),
});

export type ScanLockMetadata = z.infer<typeof ScanLockMetadataSchema>;

export class ScanLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanLockError";
  }
}

export interface ScanLock {
  metadata: ScanLockMetadata;
  release: () => void;
}

export interface AcquireScanLockOptions {
  lockPath?: string;
  profile: RoleProfile;
  now?: () => Date;
  pid?: number;
  host?: string;
  isProcessRunning?: (pid: number) => boolean;
  malformedLockStaleMs?: number;
}

function defaultIsProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function buildMetadata(
  profile: RoleProfile,
  now: () => Date,
  pid: number,
  host: string,
): ScanLockMetadata {
  return {
    version: 1,
    pid,
    profile,
    startedAt: now().toISOString(),
    host,
  };
}

function readLockMetadata(lockPath: string): ScanLockMetadata | null {
  if (!existsSync(lockPath)) {
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(lockPath, "utf8")) as unknown;
    return ScanLockMetadataSchema.parse(raw);
  } catch {
    return null;
  }
}

function describesSameLock(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  );
}

function removeObservedLock(lockPath: string, observed: Stats): boolean {
  if (!existsSync(lockPath)) {
    return false;
  }

  const current = statSync(lockPath);
  if (!describesSameLock(observed, current)) {
    return false;
  }

  unlinkSync(lockPath);
  return true;
}

function statLockIfPresent(lockPath: string): Stats | null {
  try {
    return statSync(lockPath);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

function isActiveOrForeignLock(
  metadata: ScanLockMetadata,
  localHost: string,
  isProcessRunning: (pid: number) => boolean,
): boolean {
  if (metadata.host !== localHost) {
    return true;
  }
  return isProcessRunning(metadata.pid);
}

function tryCreateLock(lockPath: string, metadata: ScanLockMetadata): boolean {
  ensureLockParentDir(lockPath);
  try {
    writeFileSync(lockPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx" });
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "EEXIST"
    ) {
      return false;
    }
    throw error;
  }
}

export function acquireScanLock(options: AcquireScanLockOptions): ScanLock {
  const lockPath = options.lockPath ?? DEFAULT_SCAN_LOCK_PATH;
  const now = options.now ?? (() => new Date());
  const pid = options.pid ?? process.pid;
  const host = options.host ?? hostname();
  const isProcessRunning = options.isProcessRunning ?? defaultIsProcessRunning;
  const malformedLockStaleMs =
    options.malformedLockStaleMs ?? DEFAULT_MALFORMED_LOCK_STALE_MS;

  const metadata = buildMetadata(options.profile, now, pid, host);

  if (tryCreateLock(lockPath, metadata)) {
    return {
      metadata,
      release: () => releaseScanLock(lockPath, metadata),
    };
  }

  const observed = statLockIfPresent(lockPath);
  if (!observed) {
    if (tryCreateLock(lockPath, metadata)) {
      return {
        metadata,
        release: () => releaseScanLock(lockPath, metadata),
      };
    }
    throw new ScanLockError(
      `Job scan lock at ${lockPath} changed while acquiring it; another scan may be starting.`,
    );
  }
  const existing = readLockMetadata(lockPath);
  if (existing && isActiveOrForeignLock(existing, host, isProcessRunning)) {
    throw new ScanLockError(
      `Job scan already in progress for profile ${existing.profile} (pid ${existing.pid} on ${existing.host}, started ${existing.startedAt}).`,
    );
  }

  if (!existing && now().getTime() - observed.mtimeMs < malformedLockStaleMs) {
    throw new ScanLockError(
      `Job scan lock at ${lockPath} is fresh but its metadata is not yet readable; another scan may be starting.`,
    );
  }

  if (!removeObservedLock(lockPath, observed)) {
    throw new ScanLockError(
      `Job scan lock at ${lockPath} changed while checking it; another scan may be starting.`,
    );
  }

  if (!tryCreateLock(lockPath, metadata)) {
    const raced = readLockMetadata(lockPath);
    if (raced && isActiveOrForeignLock(raced, host, isProcessRunning)) {
      throw new ScanLockError(
        `Job scan already in progress for profile ${raced.profile} (pid ${raced.pid} on ${raced.host}, started ${raced.startedAt}).`,
      );
    }
    throw new ScanLockError(`Failed to acquire scan lock at ${lockPath}.`);
  }

  return {
    metadata,
    release: () => releaseScanLock(lockPath, metadata),
  };
}

export function releaseScanLock(lockPath: string, expected?: ScanLockMetadata): void {
  const observed = statLockIfPresent(lockPath);
  if (!observed) {
    return;
  }

  if (expected) {
    const current = readLockMetadata(lockPath);
    if (
      !current ||
      current.pid !== expected.pid ||
      current.startedAt !== expected.startedAt ||
      current.profile !== expected.profile ||
      current.host !== expected.host
    ) {
      return;
    }
  }

  removeObservedLock(lockPath, observed);
}

export function ensureLockParentDir(lockPath: string): void {
  const parent = dirname(lockPath);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}
