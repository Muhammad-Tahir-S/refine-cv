import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export interface AtomicWriteOptions {
  /** Keep a single `.bak` copy of the previous file before replacement. */
  backup?: boolean;
  encoding?: BufferEncoding;
  syncDirectory?: (directoryPath: string) => void;
}

export class StateCorruptionError extends Error {
  readonly statePath: string;
  readonly corruptPath?: string;

  constructor(message: string, statePath: string, corruptPath?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StateCorruptionError";
    this.statePath = statePath;
    this.corruptPath = corruptPath;
  }
}

function tempPathFor(targetPath: string): string {
  const dir = dirname(targetPath);
  const base = basename(targetPath);
  return join(dir, `.${base}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`);
}

function fsyncFile(path: string): void {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export interface DirectorySyncOperations {
  open: typeof openSync;
  fsync: typeof fsyncSync;
  close: typeof closeSync;
}

const UNSUPPORTED_DIRECTORY_FSYNC_CODES = new Set([
  "EBADF",
  "EINVAL",
  "EISDIR",
  "ENOTSUP",
  "EOPNOTSUPP",
  "EPERM",
]);

function isUnsupportedDirectoryFsyncError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    UNSUPPORTED_DIRECTORY_FSYNC_CODES.has(
      String((error as NodeJS.ErrnoException).code),
    )
  );
}

/**
 * Flushes directory metadata after a rename. Some supported Node platforms do
 * not permit opening or syncing directory descriptors; only those documented
 * capability errors are ignored.
 */
export function fsyncDirectory(
  directoryPath: string,
  operations: DirectorySyncOperations = {
    open: openSync,
    fsync: fsyncSync,
    close: closeSync,
  },
): void {
  let fd: number | undefined;
  try {
    fd = operations.open(directoryPath, "r");
    operations.fsync(fd);
  } catch (error) {
    if (!isUnsupportedDirectoryFsyncError(error)) {
      throw error;
    }
  } finally {
    if (fd !== undefined) {
      operations.close(fd);
    }
  }
}

function removeBackupIfPresent(targetPath: string): void {
  const backupPath = `${targetPath}.bak`;
  if (existsSync(backupPath)) {
    unlinkSync(backupPath);
  }
}

function writeBackup(targetPath: string): void {
  if (!existsSync(targetPath)) {
    return;
  }
  const backupPath = `${targetPath}.bak`;
  copyFileSync(targetPath, backupPath);
}

export function atomicWriteFile(
  targetPath: string,
  content: string,
  options: AtomicWriteOptions = {},
): void {
  const encoding = options.encoding ?? "utf8";
  const dir = dirname(targetPath);
  const syncDirectory = options.syncDirectory ?? fsyncDirectory;
  mkdirSync(dir, { recursive: true });

  const tempPath = tempPathFor(targetPath);
  try {
    if (options.backup) {
      writeBackup(targetPath);
    }

    writeFileSync(tempPath, content, encoding);
    fsyncFile(tempPath);
    renameSync(tempPath, targetPath);
    syncDirectory(dir);
  } catch (error) {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
    throw error;
  }
}

export function atomicWriteJson<T>(
  targetPath: string,
  value: T,
  options: AtomicWriteOptions = {},
): void {
  atomicWriteFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, options);
}

export function readJsonFile(statePath: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(statePath, "utf8");
  } catch (error) {
    throw new StateCorruptionError(
      `Unable to read state file at ${statePath}`,
      statePath,
      undefined,
      { cause: error },
    );
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const corruptPath = `${statePath}.corrupt.${Date.now()}`;
    renameSync(statePath, corruptPath);
    throw new StateCorruptionError(
      `State file at ${statePath} contains invalid JSON. Corrupt file preserved at ${corruptPath}. Restore from backup or fix manually before retrying.`,
      statePath,
      corruptPath,
      { cause: error },
    );
  }
}

export function loadPersistedState<T>(
  statePath: string,
  migrate: (raw: unknown) => T,
  emptyDefault: () => T,
): T {
  if (!existsSync(statePath)) {
    return emptyDefault();
  }

  const raw = readJsonFile(statePath);
  try {
    return migrate(raw);
  } catch (error) {
    if (error instanceof StateCorruptionError) {
      throw error;
    }
    const corruptPath = `${statePath}.corrupt.${Date.now()}`;
    renameSync(statePath, corruptPath);
    throw new StateCorruptionError(
      `State file at ${statePath} failed schema validation. Corrupt file preserved at ${corruptPath}. Restore from ${statePath}.bak if available.`,
      statePath,
      corruptPath,
      { cause: error },
    );
  }
}

export function removePathIfExists(path: string): void {
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export { removeBackupIfPresent };
