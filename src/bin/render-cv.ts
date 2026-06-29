#!/usr/bin/env tsx
import { Command } from "commander";
import { runRenderCv } from "../lib/pdf/render-cv.js";

const program = new Command();
program
  .name("render-cv")
  .description("Render tailored CV markdown to an ATS-friendly PDF")
  .argument("<input>", "Path to tailored-cv.md or base-cv-enhanced.md")
  .option("-o, --out <path>", "Output PDF path")
  .action(async (input: string, opts: { out?: string }) => {
    await runRenderCv({
      inputPath: input,
      outputPath: opts.out,
    });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
