#!/usr/bin/env node
import { runLinkedInLogin } from "../lib/jobs/linkedin-discovery.js";

runLinkedInLogin().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
