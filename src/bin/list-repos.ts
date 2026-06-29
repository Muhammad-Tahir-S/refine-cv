#!/usr/bin/env tsx
import { Command } from "commander";
import { runListRepos } from "../lib/github/list-candidates.js";

const program = new Command();
program
  .name("list-repos")
  .description("List GitHub repos you have pushed to (for config selection)")
  .option("-u, --username <login>", "GitHub username")
  .option("-y, --years <n>", "Years of history", "10")
  .option("--public-only", "Public repos only (no token)")
  .action(async (opts: { username?: string; years: string; publicOnly?: boolean }) => {
    await runListRepos({
      username: opts.username,
      years: Number.parseInt(opts.years, 10),
      publicOnly: opts.publicOnly,
    });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
