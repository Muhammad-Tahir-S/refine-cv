import { paths } from "../paths.js";
import {
  computeNextSourcePollState,
  partitionScanResults,
  runScanPipeline,
} from "./pipeline.js";
import {
  computeEffectivenessMetrics,
  rankMatchedJobs,
} from "./scoring.js";
import { SCAN_ARTIFACT_NAMES } from "./artifact-names.js";
import {
  boardDisplayName,
  buildRunManifest,
  createDefaultRunManifestMetadataReader,
  groupExclusionsByReason,
  repoRelativeConfigLabel,
  serializeRunManifest,
  serializeScanResult,
  sha256Hex,
  type RunManifestMetadataReader,
} from "./manifest.js";
import { renderScanReport } from "./report.js";
import {
  loadAndCompileScanPolicySnapshot,
  serializeScanPolicy,
  type ScanPolicy,
} from "./scan-policy.js";
import { acquireScanLock, DEFAULT_SCAN_LOCK_PATH } from "./scan-lock.js";
import {
  defaultRandomSuffix,
  publishScanArtifacts,
  resolveUniqueRunPaths,
  scanRunDirName,
  writeLatestRunPointer,
} from "./scan-run.js";
import {
  loadSourcePollState,
  saveSourcePollState,
  SOURCE_POLL_STATE_PATH,
} from "./source-poll-state.js";
import {
  getEnabledSources,
  loadJobSourcesConfigSnapshot,
} from "./sources/registry.js";
import { resolveEffectiveSourceOptions } from "./sources/source-options.js";
import {
  APPLIED_JOBS_PATH,
  mergeAppliedFromReports,
  loadScanState,
  saveJobLifecycleState,
  saveScanState,
  SCAN_STATE_PATH,
  updateScanState,
} from "./state.js";
import type { ScanRunResult, SourceCatalogEntry } from "./types.js";

export interface JobScanPaths {
  jobsDir: string;
  scanStatePath: string;
  lifecycleStatePath: string;
  sourcePollStatePath: string;
  lockPath: string;
}

export interface JobScanClock {
  now: () => Date;
  randomSuffix: () => string;
}

export interface JobScanPersistence {
  saveScanState: typeof saveScanState;
  saveJobLifecycleState: typeof saveJobLifecycleState;
  saveSourcePollState: typeof saveSourcePollState;
}

export interface RunJobScanOptions {
  configPath?: string;
  profileOverride?: ScanPolicy["roleProfile"];
  forcePoll?: boolean;
  paths?: Partial<JobScanPaths>;
  clock?: Partial<JobScanClock>;
  runPipeline?: typeof runScanPipeline;
  publishArtifacts?: typeof publishScanArtifacts;
  persistence?: Partial<JobScanPersistence>;
  metadataReader?: RunManifestMetadataReader;
  loadPolicySnapshot?: typeof loadAndCompileScanPolicySnapshot;
  loadSourceConfigSnapshot?: typeof loadJobSourcesConfigSnapshot;
}

function defaultPaths(overrides: Partial<JobScanPaths> = {}): JobScanPaths {
  return {
    jobsDir: overrides.jobsDir ?? paths.jobsDir,
    scanStatePath: overrides.scanStatePath ?? SCAN_STATE_PATH,
    lifecycleStatePath: overrides.lifecycleStatePath ?? APPLIED_JOBS_PATH,
    sourcePollStatePath: overrides.sourcePollStatePath ?? SOURCE_POLL_STATE_PATH,
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

function buildSourceCatalog(
  sourcesConfig: ReturnType<typeof loadJobSourcesConfigSnapshot>["config"],
): SourceCatalogEntry[] {
  const globalAttribution = sourcesConfig.attribution;
  return getEnabledSources(sourcesConfig).map((source) => ({
    configuredSourceId: source.id,
    adapter: source.adapter,
    boardName: boardDisplayName(source.adapter),
    attribution:
      source.attribution ??
      globalAttribution ??
      "Public job board listing",
    minPollHours: source.minPollHours ?? 0,
  }));
}

export async function runJobScan(
  options: RunJobScanOptions = {},
): Promise<ScanRunResult> {
  const policySnapshot = (options.loadPolicySnapshot ?? loadAndCompileScanPolicySnapshot)({
    configPath: options.configPath,
    profileOverride: options.profileOverride,
  });
  const policy = policySnapshot.policy;
  const scanPaths = defaultPaths(options.paths);
  const clock = defaultClock(options.clock);
  const runPipeline = options.runPipeline ?? runScanPipeline;
  const publishArtifacts = options.publishArtifacts ?? publishScanArtifacts;
  const persistence: JobScanPersistence = {
    saveScanState: options.persistence?.saveScanState ?? saveScanState,
    saveJobLifecycleState:
      options.persistence?.saveJobLifecycleState ?? saveJobLifecycleState,
    saveSourcePollState:
      options.persistence?.saveSourcePollState ?? saveSourcePollState,
  };

  const lock = acquireScanLock({
    lockPath: scanPaths.lockPath,
    profile: policy.roleProfile,
    now: clock.now,
  });

  try {
    const startedAt = clock.now().toISOString();
    const lifecycleState = mergeAppliedFromReports(
      scanPaths.jobsDir,
      scanPaths.lifecycleStatePath,
    );
    const scanState = loadScanState(scanPaths.scanStatePath);
    const pollState = loadSourcePollState(scanPaths.sourcePollStatePath);
    const sourcesSnapshot =
      (options.loadSourceConfigSnapshot ?? loadJobSourcesConfigSnapshot)();
    const sourcesConfig = sourcesSnapshot.config;
    const sourceEntries = getEnabledSources(sourcesConfig);

    const pipeline = await runPipeline(policy, {
      forcePoll: options.forcePoll,
      pollState,
      now: clock.now,
      sources: sourceEntries,
    });
    const policyMatched = pipeline.matched.length;
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

    const referenceDate = clock.now();
    const rankedMatched = rankMatchedJobs(
      activeMatched,
      policy.roleProfile,
      referenceDate,
    );
    const effectiveness = computeEffectivenessMetrics({
      policyMatched: pipeline.matched,
      newJobs,
      previouslySeen,
      lifecycleSuppressed,
      lifecycleState,
      sourceStats: pipeline.sourceStats,
      roleProfile: policy.roleProfile,
      referenceDate,
    });

    const completedAt = clock.now().toISOString();
    const durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));
    const nextPollState = computeNextSourcePollState(
      pollState,
      policy.roleProfile,
      pipeline.pollStateUpdates,
    );
    const nextScanState = pipeline.hadSuccessfulSourceFetch
      ? updateScanState(
          scanState,
          policy.roleProfile,
          stateEntries,
          completedAt,
        )
      : scanState;

    const { runId, finalDirName, finalOutputDir, stagingOutputDir } = resolveUniqueRunPaths(
      scanPaths.jobsDir,
      policy.roleProfile,
      clock,
    );

    const serializedPolicy = serializeScanPolicy(policy);
    const exclusionsByReason = groupExclusionsByReason(pipeline.excluded);
    const sourceCatalog = buildSourceCatalog(sourcesConfig);
    const artifacts = {
      report: SCAN_ARTIFACT_NAMES.report,
      scanResult: SCAN_ARTIFACT_NAMES.scanResult,
      manifest: SCAN_ARTIFACT_NAMES.manifest,
    };

    const result: ScanRunResult = {
      scanDate: formatScanDate(clock.now()),
      outputDir: finalOutputDir,
      runDirName: finalDirName,
      runId,
      startedAt,
      completedAt,
      durationMs,
      policy: serializedPolicy,
      policyMatched,
      allMatched: activeMatched,
      rankedMatched,
      newJobs,
      previouslySeen,
      lifecycleSuppressed,
      effectiveness,
      excluded: pipeline.excluded,
      exclusionsByReason,
      blocklistExcluded: pipeline.blocklistExcluded,
      dedupeSummary: pipeline.dedupeSummary,
      fetchErrors: pipeline.fetchErrors,
      sourceStats: pipeline.sourceStats,
      sourceCatalog,
      outcome: pipeline.outcome,
      hadSuccessfulSourceFetch: pipeline.hadSuccessfulSourceFetch,
      forcePoll: options.forcePoll ?? false,
      artifacts,
    };

    const metadataReader =
      options.metadataReader ?? createDefaultRunManifestMetadataReader();
    const metadata = {
      applicationVersion: metadataReader.readApplicationVersion(),
      gitCommit: metadataReader.readGitCommit(),
      jobSearchConfig: {
        label: repoRelativeConfigLabel(policy.configPath),
        sha256: sha256Hex(policySnapshot.rawContent),
      },
      jobSourcesConfig: {
        label: repoRelativeConfigLabel(sourcesSnapshot.configPath),
        sha256: sha256Hex(sourcesSnapshot.rawContent),
      },
      sourceConfigVersion: sourcesConfig.version,
    };
    const manifest = buildRunManifest({
      result,
      startedAt,
      completedAt,
      forcePoll: options.forcePoll ?? false,
      sourceEntries: sourceEntries.map((source) =>
        resolveEffectiveSourceOptions(source, policy.roleProfile),
      ),
      globalAttribution: sourcesConfig.attribution,
      metadata,
    });

    publishArtifacts({
      jobsDir: scanPaths.jobsDir,
      runId,
      finalOutputDir,
      stagingOutputDir,
      scanResultJson: serializeScanResult(result),
      reportMarkdown: renderScanReport(result),
      manifestJson: serializeRunManifest(manifest),
      publishedAt: completedAt,
    });

    writeLatestRunPointer(scanPaths.jobsDir, policy.roleProfile, {
      runId,
      runDirName: scanRunDirName(runId),
      publishedAt: completedAt,
      artifacts,
    });

    persistence.saveScanState(nextScanState, scanPaths.scanStatePath);
    persistence.saveJobLifecycleState(
      lifecycleState,
      scanPaths.lifecycleStatePath,
    );
    persistence.saveSourcePollState(nextPollState, scanPaths.sourcePollStatePath);

    return result;
  } finally {
    lock.release();
  }
}
