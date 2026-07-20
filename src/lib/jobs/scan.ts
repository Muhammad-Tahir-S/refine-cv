import { paths } from "../paths.js";
import { runScanPipeline, partitionScanResults } from "./pipeline.js";
import { renderScanReport } from "./report.js";
import {
  loadAndCompileScanPolicy,
  serializeScanPolicy,
  type ScanPolicy,
} from "./scan-policy.js";
import { acquireScanLock, DEFAULT_SCAN_LOCK_PATH } from "./scan-lock.js";
import {
  defaultRandomSuffix,
  publishScanArtifacts,
  resolveUniqueRunPaths,
  writeLatestRunPointer,
} from "./scan-run.js";
import {
  APPLIED_JOBS_PATH,
  mergeAppliedFromReports,
  loadScanState,
  saveJobLifecycleState,
  saveScanState,
  SCAN_STATE_PATH,
  updateScanState,
} from "./state.js";
import type { ScanRunResult } from "./types.js";

export interface JobScanPaths {
  jobsDir: string;
  scanStatePath: string;
  lifecycleStatePath: string;
  lockPath: string;
}

export interface JobScanClock {
  now: () => Date;
  randomSuffix: () => string;
}

export interface JobScanPersistence {
  saveScanState: typeof saveScanState;
  saveJobLifecycleState: typeof saveJobLifecycleState;
}

export interface RunJobScanOptions {
  configPath?: string;
  profileOverride?: ScanPolicy["roleProfile"];
  paths?: Partial<JobScanPaths>;
  clock?: Partial<JobScanClock>;
  runPipeline?: typeof runScanPipeline;
  publishArtifacts?: typeof publishScanArtifacts;
  persistence?: Partial<JobScanPersistence>;
}

function defaultPaths(overrides: Partial<JobScanPaths> = {}): JobScanPaths {
  return {
    jobsDir: overrides.jobsDir ?? paths.jobsDir,
    scanStatePath: overrides.scanStatePath ?? SCAN_STATE_PATH,
    lifecycleStatePath: overrides.lifecycleStatePath ?? APPLIED_JOBS_PATH,
    lockPath: overrides.lockPath ?? DEFAULT_SCAN_LOCK_PATH,
  };
}

function defaultClock(overrides: Partial<JobScanClock> = {}): JobScanClock {
  return {
    now: overrides.now ?? (() => new Date()),
    randomSuffix: overrides.randomSuffix ?? defaultRandomSuffix,
  };
}

function formatScanDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function runJobScan(
  options: RunJobScanOptions = {},
): Promise<ScanRunResult> {
  const policy = loadAndCompileScanPolicy({
    configPath: options.configPath,
    profileOverride: options.profileOverride,
  });
  const scanPaths = defaultPaths(options.paths);
  const clock = defaultClock(options.clock);
  const runPipeline = options.runPipeline ?? runScanPipeline;
  const publishArtifacts = options.publishArtifacts ?? publishScanArtifacts;
  const persistence: JobScanPersistence = {
    saveScanState: options.persistence?.saveScanState ?? saveScanState,
    saveJobLifecycleState:
      options.persistence?.saveJobLifecycleState ?? saveJobLifecycleState,
  };

  const lock = acquireScanLock({
    lockPath: scanPaths.lockPath,
    profile: policy.roleProfile,
    now: clock.now,
  });

  try {
    const lifecycleState = mergeAppliedFromReports(
      scanPaths.jobsDir,
      scanPaths.lifecycleStatePath,
    );
    const scanState = loadScanState(scanPaths.scanStatePath);

    const pipeline = await runPipeline(policy);
    const {
      activeMatched,
      newJobs,
      previouslySeen,
      stateEntries,
      lifecycleSuppressed,
    } = partitionScanResults(
      pipeline.matched,
      scanState,
      lifecycleState,
      policy.roleProfile,
    );

    const observedAt = clock.now().toISOString();
    const nextScanState = updateScanState(
      scanState,
      policy.roleProfile,
      stateEntries,
      observedAt,
    );

    const { runId, finalOutputDir, stagingOutputDir } = resolveUniqueRunPaths(
      scanPaths.jobsDir,
      policy.roleProfile,
      clock,
    );

    const serializedPolicy = serializeScanPolicy(policy);
    const result: ScanRunResult = {
      scanDate: formatScanDate(clock.now()),
      outputDir: finalOutputDir,
      runId,
      policy: serializedPolicy,
      allMatched: activeMatched,
      newJobs,
      previouslySeen,
      lifecycleSuppressed,
      excluded: pipeline.excluded,
      blocklistExcluded: pipeline.blocklistExcluded,
      fetchErrors: pipeline.fetchErrors,
      sourceStats: pipeline.sourceStats,
    };

    publishArtifacts({
      jobsDir: scanPaths.jobsDir,
      runId,
      finalOutputDir,
      stagingOutputDir,
      rawJson: `${JSON.stringify(result, null, 2)}\n`,
      reportMarkdown: renderScanReport(result),
      publishedAt: observedAt,
    });

    writeLatestRunPointer(scanPaths.jobsDir, policy.roleProfile, {
      runId,
      outputDir: finalOutputDir,
      publishedAt: observedAt,
    });

    persistence.saveScanState(nextScanState, scanPaths.scanStatePath);
    persistence.saveJobLifecycleState(
      lifecycleState,
      scanPaths.lifecycleStatePath,
    );

    return result;
  } finally {
    lock.release();
  }
}
