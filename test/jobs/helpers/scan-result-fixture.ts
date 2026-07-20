import type { ScanRunResult } from "../../../src/lib/jobs/types.ts";
import { SCAN_ARTIFACT_NAMES } from "../../../src/lib/jobs/artifact-names.ts";
import { computeEffectivenessMetrics, rankMatchedJobs } from "../../../src/lib/jobs/scoring.ts";

const emptyLifecycle = { applied: 0, dismissed: 0, expired: 0 };

const defaultPolicy: ScanRunResult["policy"] = {
  configLabel: "config/job-search.json",
  roleProfile: "reactFrontend",
  roleProfileLabel: "React / frontend",
  allowedLevels: ["senior", "staff_lead", "unknown"],
  geo: {
    summary: "test",
    acceptGlobalRemote: true,
    acceptEmeaOnlyWhenAfricaMentioned: true,
    defaultEmeaToVerify: true,
  },
  applicant: {
    location: "Nigeria",
    citizenship: "Nigerian",
    workPermitCountries: ["Nigeria"],
  },
  blocklistCount: 0,
};

export function makeScanRunResult(
  overrides: Partial<ScanRunResult> = {},
): ScanRunResult {
  const base: ScanRunResult = {
    scanDate: "20 July 2026",
    outputDir: "/tmp/job-scan",
    runDirName: "20260720T100000Z-react-frontend-abc123-job-scan",
    runId: "20260720T100000Z-react-frontend-abc123",
    startedAt: "2026-07-20T10:00:00.000Z",
    completedAt: "2026-07-20T10:00:05.000Z",
    durationMs: 5000,
    policy: defaultPolicy,
    policyMatched: 0,
    allMatched: [],
    rankedMatched: [],
    newJobs: [],
    previouslySeen: [],
    lifecycleSuppressed: emptyLifecycle,
    effectiveness: {
      sourceYield: [],
      falsePositiveProxy: null,
      likelyExpiredAmongMatched: 0,
      lifecycleSuppressed: emptyLifecycle,
    },
    excluded: [],
    exclusionsByReason: {},
    blocklistExcluded: 0,
    dedupeSummary: { inputCount: 0, outputCount: 0, mergedCount: 0 },
    fetchErrors: [],
    sourceStats: [],
    sourceCatalog: [],
    outcome: {
      attemptedSources: 0,
      skippedSources: 0,
      succeededSources: 0,
      failedSources: 0,
      allSkippedDueToCadence: false,
      totalSourceOutage: false,
    },
    hadSuccessfulSourceFetch: true,
    forcePoll: false,
    artifacts: {
      report: SCAN_ARTIFACT_NAMES.report,
      scanResult: SCAN_ARTIFACT_NAMES.scanResult,
      manifest: SCAN_ARTIFACT_NAMES.manifest,
    },
    ...overrides,
  };

  const referenceDate = new Date(base.completedAt);
  const rankedMatched =
    overrides.rankedMatched ??
    rankMatchedJobs(base.allMatched, base.policy.roleProfile, referenceDate);
  const effectiveness =
    overrides.effectiveness ??
    computeEffectivenessMetrics({
      policyMatched: base.allMatched.slice(0, base.policyMatched || base.allMatched.length),
      newJobs: base.newJobs,
      previouslySeen: base.previouslySeen,
      lifecycleSuppressed: base.lifecycleSuppressed,
      lifecycleState: { version: 2, applied: {}, dismissed: {}, expired: {} },
      sourceStats: base.sourceStats,
      roleProfile: base.policy.roleProfile,
      referenceDate,
    });

  return {
    ...base,
    rankedMatched,
    effectiveness,
  };
}
