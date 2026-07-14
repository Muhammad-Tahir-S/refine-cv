#!/usr/bin/env node
import { runJobScan } from "../lib/jobs/scan.js";

runJobScan()
  .then((result) => {
    console.log(`Scan complete.`);
    console.log(`  Matched: ${result.allMatched.length}`);
    console.log(`  New: ${result.newJobs.length}`);
    console.log(`  Report: ${result.outputDir}/report.md`);
    if (result.fetchErrors.length > 0) {
      console.log(`  Fetch errors: ${result.fetchErrors.length}`);
    }
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
