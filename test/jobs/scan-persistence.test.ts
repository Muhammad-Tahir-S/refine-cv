import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeLegacyDedupeKey } from "../../src/lib/jobs/dedupe.ts";
import {
  atomicWriteJson,
  fsyncDirectory,
  loadPersistedState,
  StateCorruptionError,
} from "../../src/lib/jobs/persistence.ts";
import { runJobScan } from "../../src/lib/jobs/scan.ts";
import { saveSourcePollState } from "../../src/lib/jobs/source-poll-state.ts";
import {
  acquireScanLock,
  releaseScanLock,
  ScanLockError,
} from "../../src/lib/jobs/scan-lock.ts";
import {
  buildScanRunId,
  isJobScanDirName,
  listCompletedJobScanDirs,
  publishScanArtifacts,
  resolveUniqueRunPaths,
  scanRunDirName,
  stagingDirName,
  STAGING_DIR_PREFIX,
} from "../../src/lib/jobs/scan-run.ts";
import {
  loadJobLifecycleState,
  loadScanState,
  mergeAppliedFromReports,
  migrateScanState,
  saveJobLifecycleState,
  saveScanState,
} from "../../src/lib/jobs/state.ts";
import type { JobPosting } from "../../src/lib/jobs/types.ts";
import { normalizeRawPosting } from "../../src/lib/jobs/normalize.ts";
import { paths } from "../../src/lib/paths.ts";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "refine-cv-scan-persist-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixedClock(iso: string, suffix = "abc123") {
  return {
    now: () => new Date(iso),
    randomSuffix: () => suffix,
  };
}

function samplePosting(): JobPosting {
  return normalizeRawPosting(
    {
      sourceId: "jobicy",
      sourceJobId: "1",
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/react",
      location: "Worldwide",
      description: "React role",
    },
    "2026-07-20T10:00:00.000Z",
  );
}

function emptyPipeline(posting: JobPosting) {
  return {
    fetchedAt: "2026-07-20T10:00:00.000Z",
    allRaw: [posting],
    matched: [posting],
    excluded: [],
    fetchErrors: [],
    sourceStats: [],
    blocklistExcluded: 0,
    dedupeSummary: { inputCount: 1, outputCount: 1, mergedCount: 0 },
    pollStateUpdates: [],
    hadSuccessfulSourceFetch: true,
    outcome: {
      attemptedSources: 0,
      skippedSources: 0,
      succeededSources: 0,
      failedSources: 0,
      allSkippedDueToCadence: false,
      totalSourceOutage: false,
    },
  };
}

describe("atomic persistence", () => {
  it("round-trips JSON atomically with optional backup", () => {
    const dir = makeTempDir();
    const target = join(dir, "scan-state.json");

    atomicWriteJson(target, { version: 3, profiles: {} }, { backup: true });
    atomicWriteJson(target, { version: 3, profiles: { reactFrontend: {} } }, { backup: true });

    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual({
      version: 3,
      profiles: { reactFrontend: {} },
    });
    expect(existsSync(`${target}.bak`)).toBe(true);
  });

  it("preserves corrupt JSON and throws an actionable error", () => {
    const dir = makeTempDir();
    const target = join(dir, "scan-state.json");
    writeFileSync(target, "{not-json");

    expect(() =>
      loadPersistedState(target, migrateScanState, () => ({
        version: 3,
        profiles: { reactFrontend: {}, nodejsBackend: {} },
      })),
    ).toThrow(StateCorruptionError);

    expect(existsSync(target)).toBe(false);
    const preserved = readdirSync(dir).find((name) => name.startsWith("scan-state.json.corrupt."));
    expect(preserved).toBeDefined();
  });

  it("fsyncs the parent directory after replacing a file", () => {
    const dir = makeTempDir();
    const target = join(dir, "state.json");
    const synced: string[] = [];

    atomicWriteJson(
      target,
      { ok: true },
      { syncDirectory: (path) => synced.push(path) },
    );

    expect(synced).toEqual([dir]);
  });

  it("ignores only unsupported directory fsync errors", () => {
    const unsupported = Object.assign(new Error("unsupported"), {
      code: "EINVAL",
    });
    expect(() =>
      fsyncDirectory("/tmp", {
        open: (() => 10) as typeof import("node:fs").openSync,
        fsync: (() => {
          throw unsupported;
        }) as typeof import("node:fs").fsyncSync,
        close: (() => undefined) as typeof import("node:fs").closeSync,
      }),
    ).not.toThrow();

    expect(() =>
      fsyncDirectory("/tmp", {
        open: (() => 10) as typeof import("node:fs").openSync,
        fsync: (() => {
          throw Object.assign(new Error("disk failure"), { code: "EIO" });
        }) as typeof import("node:fs").fsyncSync,
        close: (() => undefined) as typeof import("node:fs").closeSync,
      }),
    ).toThrow("disk failure");
  });
});

describe("scan run directories", () => {
  it("creates collision-resistant run IDs for same-second runs", () => {
    const iso = "2026-07-20T10:00:00.000Z";
    const first = buildScanRunId("reactFrontend", () => new Date(iso), () => "aaa111");
    const second = buildScanRunId("reactFrontend", () => new Date(iso), () => "bbb222");

    expect(first).not.toBe(second);
    expect(scanRunDirName(first)).toBe(`${first}-job-scan`);
    expect(isJobScanDirName("2026-07-18-job-scan")).toBe(true);
    expect(isJobScanDirName(stagingDirName(first))).toBe(false);
  });

  it("publishes through staging and removes staging on failure", () => {
    const dir = makeTempDir();
    const runId = "20260720T100000Z-react-frontend-dead01";
    const finalOutputDir = join(dir, scanRunDirName(runId));
    const stagingOutputDir = join(dir, stagingDirName(runId));
    const synced: string[] = [];

    publishScanArtifacts({
      jobsDir: dir,
      runId,
      finalOutputDir,
      stagingOutputDir,
      rawJson: '{"ok":true}\n',
      reportMarkdown: "# report\n",
      syncDirectory: (path) => synced.push(path),
    });

    expect(existsSync(finalOutputDir)).toBe(true);
    expect(existsSync(join(finalOutputDir, "report.md"))).toBe(true);
    expect(existsSync(stagingOutputDir)).toBe(false);
    expect(synced).toEqual([dir]);

    expect(() =>
      publishScanArtifacts({
        jobsDir: dir,
        runId: `${runId}-retry`,
        finalOutputDir: join(dir, scanRunDirName(`${runId}-retry`)),
        stagingOutputDir: join(dir, stagingDirName(`${runId}-retry`)),
        rawJson: "{}",
        reportMarkdown: "# report\n",
        writeAtomicFile: () => {
          throw new Error("write failed");
        },
      }),
    ).toThrow("write failed");

    expect(
      readdirSync(dir).some((name) => name.startsWith(`${STAGING_DIR_PREFIX}${runId}-retry`)),
    ).toBe(false);
  });

  it("allocates distinct directories when suffix collides on disk", () => {
    const dir = makeTempDir();
    const iso = "2026-07-20T10:00:00.000Z";
    const first = resolveUniqueRunPaths(dir, "reactFrontend", {
      now: () => new Date(iso),
      randomSuffix: () => "dup001",
    });
    mkdirSync(join(dir, scanRunDirName(first.runId)), { recursive: true });

    let calls = 0;
    const second = resolveUniqueRunPaths(dir, "reactFrontend", {
      now: () => new Date(iso),
      randomSuffix: () => {
        calls += 1;
        return calls === 1 ? "dup001" : "dup002";
      },
    });

    expect(second.runId).not.toBe(first.runId);
  });
});

describe("scan lock", () => {
  it("rejects concurrent active locks and recovers stale inactive locks", () => {
    const dir = makeTempDir();
    const lockPath = join(dir, "job-scan.lock");
    const now = () => new Date("2026-07-20T10:00:00.000Z");

    const first = acquireScanLock({
      lockPath,
      profile: "reactFrontend",
      now,
      pid: 111,
      isProcessRunning: () => true,
    });

    expect(() =>
      acquireScanLock({
        lockPath,
        profile: "reactFrontend",
        now,
        pid: 222,
        isProcessRunning: () => true,
      }),
    ).toThrow(ScanLockError);

    first.release();

    writeFileSync(
      lockPath,
      `${JSON.stringify({
        version: 1,
        pid: 999,
        profile: "reactFrontend",
        startedAt: "2026-07-20T09:00:00.000Z",
        host: "test",
      })}\n`,
    );

    const recovered = acquireScanLock({
      lockPath,
      profile: "reactFrontend",
      now,
      pid: 333,
      host: "test",
      isProcessRunning: () => false,
    });

    expect(recovered.metadata.pid).toBe(333);
    recovered.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it("does not delete a demonstrably active lock", () => {
    const dir = makeTempDir();
    const lockPath = join(dir, "job-scan.lock");
    writeFileSync(
      lockPath,
      `${JSON.stringify({
        version: 1,
        pid: 4242,
        profile: "nodejsBackend",
        startedAt: "2026-07-20T10:00:00.000Z",
        host: "test",
      })}\n`,
    );

    expect(() =>
      acquireScanLock({
        lockPath,
        profile: "reactFrontend",
        isProcessRunning: (pid) => pid === 4242,
      }),
    ).toThrow(ScanLockError);
    expect(existsSync(lockPath)).toBe(true);
    releaseScanLock(lockPath);
  });

  it("treats a fresh malformed lock as contended", () => {
    const dir = makeTempDir();
    const lockPath = join(dir, "job-scan.lock");
    const now = new Date("2026-07-20T10:00:00.000Z");
    writeFileSync(lockPath, "{");
    utimesSync(lockPath, now, now);

    expect(() =>
      acquireScanLock({
        lockPath,
        profile: "reactFrontend",
        now: () => now,
        malformedLockStaleMs: 60_000,
      }),
    ).toThrow(ScanLockError);
    expect(readFileSync(lockPath, "utf8")).toBe("{");
  });

  it("recovers a malformed lock only after its stale threshold", () => {
    const dir = makeTempDir();
    const lockPath = join(dir, "job-scan.lock");
    const now = new Date("2026-07-20T10:00:00.000Z");
    const stale = new Date(now.getTime() - 120_000);
    writeFileSync(lockPath, "{");
    utimesSync(lockPath, stale, stale);

    const lock = acquireScanLock({
      lockPath,
      profile: "reactFrontend",
      now: () => now,
      malformedLockStaleMs: 60_000,
      pid: 5151,
      host: "local-test",
    });

    expect(lock.metadata.pid).toBe(5151);
    lock.release();
  });

  it("treats a foreign-host lock as active without checking its PID", () => {
    const dir = makeTempDir();
    const lockPath = join(dir, "job-scan.lock");
    const processCheck = (pid: number) => {
      throw new Error(`must not check foreign pid ${pid}`);
    };
    writeFileSync(
      lockPath,
      `${JSON.stringify({
        version: 1,
        pid: 9999,
        profile: "reactFrontend",
        startedAt: "2026-07-19T10:00:00.000Z",
        host: "remote-host",
      })}\n`,
    );

    expect(() =>
      acquireScanLock({
        lockPath,
        profile: "reactFrontend",
        host: "local-host",
        isProcessRunning: processCheck,
      }),
    ).toThrow(ScanLockError);
    expect(existsSync(lockPath)).toBe(true);
  });

  it("safe release preserves unreadable and non-matching locks", () => {
    const dir = makeTempDir();
    const lockPath = join(dir, "job-scan.lock");
    const expected = {
      version: 1 as const,
      pid: 100,
      profile: "reactFrontend" as const,
      startedAt: "2026-07-20T10:00:00.000Z",
      host: "local-test",
    };

    writeFileSync(lockPath, "{");
    releaseScanLock(lockPath, expected);
    expect(existsSync(lockPath)).toBe(true);

    writeFileSync(
      lockPath,
      `${JSON.stringify({ ...expected, pid: 101 })}\n`,
    );
    releaseScanLock(lockPath, expected);
    expect(JSON.parse(readFileSync(lockPath, "utf8")).pid).toBe(101);
  });
});

describe("runJobScan durability ordering", () => {
  it("does not advance seen/lifecycle state when artifact publication fails", async () => {
    const root = makeTempDir();
    const jobsDir = join(root, "jobs");
    const scanStatePath = join(root, "scan-state.json");
    const lifecycleStatePath = join(root, "applied-jobs.json");
    const sourcePollStatePath = join(root, "source-poll-state.json");
    const lockPath = join(root, "job-scan.lock");
    const posting = samplePosting();

    saveScanState(
      { version: 3, profiles: { reactFrontend: {}, nodejsBackend: {} } },
      scanStatePath,
    );
    saveJobLifecycleState(
      { version: 2, applied: {}, dismissed: {}, expired: {} },
      lifecycleStatePath,
    );

    await expect(
      runJobScan({
        configPath: paths.jobSearchConfig,
        paths: {
          jobsDir,
          scanStatePath,
          lifecycleStatePath,
          sourcePollStatePath,
          lockPath,
        },
        clock: fixedClock("2026-07-20T10:00:00.000Z"),
        runPipeline: async () => emptyPipeline(posting),
        publishArtifacts: () => {
          throw new Error("artifact publish failed");
        },
      }),
    ).rejects.toThrow("artifact publish failed");

    const scanState = loadScanState(scanStatePath);
    expect(scanState.profiles.reactFrontend[posting.dedupeKey]).toBeUndefined();
    expect(loadJobLifecycleState(lifecycleStatePath).applied).toEqual({});
    if (existsSync(jobsDir)) {
      expect(
        readdirSync(jobsDir).some((name) => name.startsWith(STAGING_DIR_PREFIX)),
      ).toBe(false);
    }
  });

  it("persists state only after successful publication", async () => {
    const root = makeTempDir();
    const jobsDir = join(root, "jobs");
    const scanStatePath = join(root, "scan-state.json");
    const lifecycleStatePath = join(root, "applied-jobs.json");
    const sourcePollStatePath = join(root, "source-poll-state.json");
    const lockPath = join(root, "job-scan.lock");
    const posting = samplePosting();

    const result = await runJobScan({
      configPath: paths.jobSearchConfig,
      paths: {
        jobsDir,
        scanStatePath,
        lifecycleStatePath,
        sourcePollStatePath,
        lockPath,
      },
      clock: fixedClock("2026-07-20T10:00:00.000Z", "run001"),
      runPipeline: async () => emptyPipeline(posting),
      publishArtifacts: (input) => {
        expect(
          loadScanState(scanStatePath).profiles.reactFrontend[posting.dedupeKey],
        ).toBeUndefined();
        publishScanArtifacts(input);
        expect(existsSync(join(input.finalOutputDir, "report.md"))).toBe(true);
        expect(
          loadScanState(scanStatePath).profiles.reactFrontend[posting.dedupeKey],
        ).toBeUndefined();
      },
    });

    expect(result.outputDir).toBe(join(jobsDir, scanRunDirName(result.runId)));
    expect(loadScanState(scanStatePath).profiles.reactFrontend[posting.dedupeKey]).toBeDefined();
  });

  it.each(["scan-state", "lifecycle-state", "source-poll-state"] as const)(
    "keeps the report and releases the lock when %s persistence fails",
    async (failingWrite) => {
      const root = makeTempDir();
      const jobsDir = join(root, "jobs");
      const scanStatePath = join(root, "scan-state.json");
      const lifecycleStatePath = join(root, "applied-jobs.json");
      const sourcePollStatePath = join(root, "source-poll-state.json");
      const lockPath = join(root, "job-scan.lock");
      const posting = samplePosting();
      const failure = new Error(`${failingWrite} write failed`);
      const suffixByWrite = {
        "scan-state": "fail01",
        "lifecycle-state": "fail02",
        "source-poll-state": "fail03",
      } as const;

      await expect(
        runJobScan({
          configPath: paths.jobSearchConfig,
          paths: {
            jobsDir,
            scanStatePath,
            lifecycleStatePath,
            sourcePollStatePath,
            lockPath,
          },
          clock: fixedClock("2026-07-20T10:00:00.000Z", suffixByWrite[failingWrite]),
          runPipeline: async () => emptyPipeline(posting),
          persistence: {
            saveScanState:
              failingWrite === "scan-state"
                ? () => {
                    throw failure;
                  }
                : saveScanState,
            saveJobLifecycleState:
              failingWrite === "lifecycle-state"
                ? () => {
                    throw failure;
                  }
                : saveJobLifecycleState,
            saveSourcePollState:
              failingWrite === "source-poll-state"
                ? () => {
                    throw failure;
                  }
                : saveSourcePollState,
          },
        }),
      ).rejects.toThrow(failure.message);

      const completedRuns = listCompletedJobScanDirs(jobsDir);
      expect(completedRuns).toHaveLength(1);
      expect(existsSync(join(completedRuns[0], "report.md"))).toBe(true);
      expect(existsSync(lockPath)).toBe(false);
    },
  );
});

describe("report checkbox compatibility", () => {
  it("syncs applied checkboxes from legacy and unique run folder names", () => {
    const dir = makeTempDir();
    const jobsDir = join(dir, "jobs");
    const lifecyclePath = join(dir, "applied-jobs.json");
    const legacyDir = join(jobsDir, "2026-07-18-job-scan");
    const uniqueDir = join(jobsDir, "20260720T100000Z-react-frontend-abc123-job-scan");
    const appliedAt = "2026-06-01T08:00:00.000Z";

    for (const scanDir of [legacyDir, uniqueDir]) {
      mkdirSync(scanDir, { recursive: true });
      writeFileSync(
        join(scanDir, "report.md"),
        "- [x] Acme — React Engineer — https://example.com/jobs/react\n",
      );
    }

    saveJobLifecycleState(
      {
        version: 2,
        applied: {
          [makeLegacyDedupeKey("Acme", "React Engineer")]: {
            dedupeKey: makeLegacyDedupeKey("Acme", "React Engineer"),
            company: "Acme",
            title: "React Engineer",
            url: "https://example.com/jobs/react",
            appliedAt,
          },
        },
        dismissed: {},
        expired: {},
      },
      lifecyclePath,
    );

    const merged = mergeAppliedFromReports(jobsDir, lifecyclePath);
    expect(merged.applied[makeLegacyDedupeKey("Acme", "React Engineer")].appliedAt).toBe(
      appliedAt,
    );
  });

  it("discovers custom legacy scan folders by report signature", () => {
    const jobsDir = makeTempDir();
    const customDir = join(
      jobsDir,
      "2026-07-20-abdulhaleem-nodejs-backend-scan",
    );
    const ordinaryDir = join(jobsDir, "2026-07-20-ordinary-application");
    const hiddenDir = join(jobsDir, ".hidden-custom-scan");
    const stagingDir = join(jobsDir, ".staging-custom-scan");

    for (const directory of [
      customDir,
      ordinaryDir,
      hiddenDir,
      stagingDir,
    ]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(join(customDir, "report.md"), "# Job Scan Report\n");
    writeFileSync(join(ordinaryDir, "report.md"), "# Tailored CV\n");
    writeFileSync(join(hiddenDir, "report.md"), "# Job Scan Report\n");
    writeFileSync(join(stagingDir, "report.md"), "# Job Scan Report\n");

    expect(listCompletedJobScanDirs(jobsDir)).toEqual([customDir]);
  });
});
