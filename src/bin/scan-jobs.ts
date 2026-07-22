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
  .option(
    "--force",
    "Bypass per-source minPollHours cadence and fetch all enabled boards",
  )
  .action(async (opts: { config?: string; profile?: string; force?: boolean }) => {
    const configPath = resolveScanConfigPath(opts.config);
    const profileOverride = parseProfileOverride(opts.profile);

    const result = await runJobScan({
      configPath,
      profileOverride,
      forcePoll: opts.force ?? false,
    });

    console.log("Scan complete.");
    console.log(`  Profile: ${result.policy.roleProfile}`);
    console.log(`  Config: ${result.policy.configLabel}`);
    if (result.outcome.allSkippedDueToCadence) {
      console.log(
        "  Board fetch: all enabled sources skipped (minPollHours cadence); no fresh listings fetched.",
      );
    } else if (!result.hadSuccessfulSourceFetch) {
      console.log(
        "  Board fetch: no source returned listings successfully this run.",
      );
    }
    console.log(`  Matched: ${result.allMatched.length}`);
    console.log(`  New: ${result.newJobs.length}`);
    console.log(`  Previously seen: ${result.previouslySeen.length}`);
    console.log(
      `  Lifecycle suppressed: applied=${result.lifecycleSuppressed.applied} dismissed=${result.lifecycleSuppressed.dismissed} expired=${result.lifecycleSuppressed.expired}`,
    );
    console.log(`  Blocklisted: ${result.blocklistExcluded}`);
    console.log(`  Report: ${result.runDirName}/${result.artifacts.report}`);
    console.log(`  Manifest: ${result.runDirName}/${result.artifacts.manifest}`);
    if (result.fetchErrors.length > 0) {
      console.log(`  Fetch errors: ${result.fetchErrors.length}`);
    }
    for (const stat of result.sourceStats) {
      const statusLabel =
        stat.status === "skipped"
          ? `skipped (${stat.skipReason ?? "cadence"})`
          : stat.status === "failure"
            ? "failed"
            : "ok";
      console.log(
        `  ${stat.sourceId}: fetched=${stat.fetched} matched=${stat.matched} quarantined=${stat.quarantined} durationMs=${stat.durationMs} [${statusLabel}]`,
      );
    }

    if (result.outcome.totalSourceOutage) {
      console.error(
        `\nAll ${result.outcome.attemptedSources} attempted source(s) failed. See report for details.`,
      );
      process.exitCode = 1;
      return;
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
