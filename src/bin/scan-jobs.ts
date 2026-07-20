#!/usr/bin/env node
import { Command } from "commander";
import { runJobScan } from "../lib/jobs/scan.js";
import {
  parseProfileOverride,
  resolveScanConfigPath,
} from "../lib/jobs/scan-policy.js";

const program = new Command();

program
  .name("scan-jobs")
  .description("Fetch public job boards and write a filtered scan report")
  .option(
    "--config <path>",
    "Job search config path (default config/job-search.json)",
  )
  .option(
    "--profile <profile>",
    "Override role profile: reactFrontend or nodejsBackend",
  )
  .action(async (opts: { config?: string; profile?: string }) => {
    const configPath = resolveScanConfigPath(opts.config);
    const profileOverride = parseProfileOverride(opts.profile);

    const result = await runJobScan({
      configPath,
      profileOverride,
    });

    console.log("Scan complete.");
    console.log(`  Profile: ${result.policy.roleProfile}`);
    console.log(`  Config: ${result.policy.configLabel}`);
    console.log(`  Matched: ${result.allMatched.length}`);
    console.log(`  New: ${result.newJobs.length}`);
    console.log(`  Previously seen: ${result.previouslySeen.length}`);
    console.log(
      `  Lifecycle suppressed: applied=${result.lifecycleSuppressed.applied} dismissed=${result.lifecycleSuppressed.dismissed} expired=${result.lifecycleSuppressed.expired}`,
    );
    console.log(`  Blocklisted: ${result.blocklistExcluded}`);
    console.log(`  Report: ${result.outputDir}/report.md`);
    if (result.fetchErrors.length > 0) {
      console.log(`  Fetch errors: ${result.fetchErrors.length}`);
    }
    for (const stat of result.sourceStats) {
      console.log(
        `  ${stat.sourceId}: fetched=${stat.fetched} matched=${stat.matched} quarantined=${stat.quarantined}${stat.failed ? " (failed)" : ""}`,
      );
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
