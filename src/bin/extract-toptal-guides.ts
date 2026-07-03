#!/usr/bin/env tsx
import { runExtractToptalGuides } from "../lib/toptal/extract-guides.js";

runExtractToptalGuides().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
