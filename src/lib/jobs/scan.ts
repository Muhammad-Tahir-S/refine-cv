import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../paths.js";
import { runScanPipeline, partitionScanResults } from "./pipeline.js";
import { renderScanReport } from "./report.js";
import {
  loadAndCompileScanPolicy,
  serializeScanPolicy,
  type ScanPolicy,
} from "./scan-policy.js";
import {
  loadScanState,
  saveMergedAppliedFromReports,
  saveScanState,
  updateScanState,
} from "./state.js";
import type { ScanRunResult } from "./types.js";

function todaySlug(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface RunJobScanOptions {
  configPath?: string;
  profileOverride?: ScanPolicy["roleProfile"];
}

export async function runJobScan(
  options: RunJobScanOptions = {},
): Promise<ScanRunResult> {
  const policy = loadAndCompileScanPolicy({
    configPath: options.configPath,
    profileOverride: options.profileOverride,
  });
  const appliedState = saveMergedAppliedFromReports(paths.jobsDir);
  let scanState = loadScanState();

  const pipeline = await runScanPipeline(policy);
  const { newJobs, previouslySeen, stateEntries } = partitionScanResults(
    pipeline.matched,
    scanState,
    appliedState,
  );

  scanState = updateScanState(scanState, stateEntries);
  saveScanState(scanState);

  const scanDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const outputDir = join(paths.jobsDir, `${todaySlug()}-job-scan`);
  mkdirSync(outputDir, { recursive: true });

  const serializedPolicy = serializeScanPolicy(policy);
  const result: ScanRunResult = {
    scanDate,
    outputDir,
    policy: serializedPolicy,
    allMatched: pipeline.matched,
    newJobs,
    previouslySeen,
    excluded: pipeline.excluded,
    blocklistExcluded: pipeline.blocklistExcluded,
    fetchErrors: pipeline.fetchErrors,
    sourceStats: pipeline.sourceStats,
  };

  writeFileSync(
    join(outputDir, "raw.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  writeFileSync(join(outputDir, "report.md"), renderScanReport(result));

  return result;
}
