#!/usr/bin/env node
import { Command } from "commander";
import { runLinkedInDiscovery } from "../lib/jobs/linkedin-discovery.js";

const program = new Command();

program
  .name("discover-linkedin")
  .description("Low-volume LinkedIn discovery for new company names")
  .option("--pages <n>", "Max result pages (default 3)", "3")
  .option("--headless", "Run headless (not recommended)", false)
  .option("--force", "Bypass daily run limit (for testing)", false)
  .action(async (opts: { pages: string; headless: boolean; force: boolean }) => {
    const maxPages = Number.parseInt(opts.pages, 10);
    const result = await runLinkedInDiscovery({
      maxPages: Number.isFinite(maxPages) ? maxPages : 3,
      headed: !opts.headless,
      force: opts.force,
    });

    console.log("Discovery complete:");
    console.log(`  Jobs extracted: ${result.stats.rawHits}`);
    console.log(`  Pages scanned: ${result.stats.pagesScanned}/${result.stats.pagesRequested}`);
    console.log(`  Detail API fetches: ${result.stats.detailFetches}`);
    console.log(`  With external apply URL: ${result.stats.withExternalApply}`);
    console.log(`  Easy Apply only: ${result.stats.easyApplyOnly}`);
    console.log(`  New companies: ${result.stats.newCompanies}`);
    console.log(`Review: ${result.outputPath}`);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
