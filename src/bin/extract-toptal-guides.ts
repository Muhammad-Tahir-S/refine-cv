#!/usr/bin/env tsx
import { Command } from "commander";
import { runExtractToptalGuides } from "../lib/toptal/extract-guides.js";

const program = new Command();
program
  .name("extract-toptal-guides")
  .description("Extract Toptal PDF guides to raw and structured markdown")
  .option("-f, --force", "Overwrite existing structured markdown extracts")
  .action(async (opts: { force?: boolean }) => {
    await runExtractToptalGuides({ force: opts.force });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
