#!/usr/bin/env tsx
import { runIndexGithub } from "../lib/github/index-repos.js";

runIndexGithub().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
