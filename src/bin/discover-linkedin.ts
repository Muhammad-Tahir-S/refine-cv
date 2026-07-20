#!/usr/bin/env node
import { Command } from "commander";
import { join } from "node:path";
import { paths } from "../lib/paths.js";
import { runLinkedInDiscovery } from "../lib/jobs/linkedin-discovery.js";

const program = new Command();

program
  .name("discover-linkedin")
  .description("Low-volume LinkedIn discovery for external-apply remote roles")
  .option("--pages <n>", "Max result pages (default 3)", "3")
  .option("--headless", "Run headless (not recommended)", false)
  .option("--force", "Bypass daily run limit (for testing)", false)
  .option("--keywords <text>", "LinkedIn search keywords", "react frontend")
  .option("--experience <levels>", "LinkedIn f_E experience filter (default 2,3,4)", "2,3,4")
  .option("--config <path>", "Job search config for blocklist/profile context")
  .option("--slug <name>", "Output folder name under jobs/ for linkedin-discovery.md")
  .option(
    "--role <profile>",
    "Role profile filter: reactFrontend or nodejsBackend",
    "reactFrontend",
  )
  .option(
    "--isolated",
    "Skip updating global LinkedIn daily discovery state",
    false,
  )
  .action(
    async (opts: {
      pages: string;
      headless: boolean;
      force: boolean;
      keywords: string;
      experience: string;
      config?: string;
      slug?: string;
      role: string;
      isolated: boolean;
    }) => {
      const maxPages = Number.parseInt(opts.pages, 10);
      const today = new Date().toISOString().slice(0, 10);
      const outputPath = opts.slug
        ? join(paths.jobsDir, opts.slug, "linkedin-discovery.md")
        : undefined;

      const roleProfile =
        opts.role === "nodejsBackend" ? "nodejsBackend" : "reactFrontend";

      const result = await runLinkedInDiscovery({
        maxPages: Number.isFinite(maxPages) ? maxPages : 3,
        headed: !opts.headless,
        force: opts.force,
        keywords: opts.keywords,
        experienceLevels: opts.experience,
        configPath: opts.config,
        outputPath,
        skipDiscoveryState: opts.isolated,
        roleProfile,
      });

      console.log("Discovery complete:");
      console.log(`  Jobs extracted: ${result.stats.rawHits}`);
      console.log(`  After role filter: ${result.stats.enrichedHits}`);
      console.log(`  Pages scanned: ${result.stats.pagesScanned}/${result.stats.pagesRequested}`);
      console.log(`  Detail API fetches: ${result.stats.detailFetches}`);
      console.log(`  With external apply URL: ${result.stats.withExternalApply}`);
      console.log(`  Easy Apply only: ${result.stats.easyApplyOnly}`);
      console.log(`  Eligible after blocklist: ${result.stats.eligibleJobs}`);
      console.log(`  Blocklisted: ${result.stats.blocklisted}`);
      console.log(`Review: ${result.outputPath}`);
    },
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
