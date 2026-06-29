#!/usr/bin/env tsx
import { runExtractCv } from "../lib/pdf/extract-cv.js";

runExtractCv().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
