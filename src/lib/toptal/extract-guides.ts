import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { paths } from "../paths.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
) => Promise<{ text: string; numpages: number }>;

const GUIDES_DIR = join(paths.root, "sources/toptal-guides");
const PDF_DIR = join(GUIDES_DIR, "pdf");

const MATCHING_PDF = join(
  PDF_DIR,
  "Job Application Matching Process Handbook for Developers.pdf",
);
const PROFILE_PDF = join(PDF_DIR, "Developer - Profile Creation Guide.pdf");

const MATCHING_RAW = join(GUIDES_DIR, "_matching-handbook-raw.txt");
const PROFILE_RAW = join(GUIDES_DIR, "_profile-guide-raw.txt");

async function extractPdf(pdfPath: string, label: string): Promise<{ text: string; numpages: number }> {
  if (!existsSync(pdfPath)) {
    throw new Error(`Missing PDF: ${pdfPath}`);
  }
  const result = await pdfParse(readFileSync(pdfPath));
  const text = (result.text ?? "").trim();
  console.log(`${label}: ${text.length} characters, ${result.numpages} pages`);
  return { text, numpages: result.numpages };
}

export async function runExtractToptalGuides(): Promise<void> {
  const extractedAt = new Date().toISOString();

  const matching = await extractPdf(MATCHING_PDF, "Matching handbook");
  writeFileSync(
    MATCHING_RAW,
    `# Raw extract — Job Application Matching Process Handbook\n\n**extractedAt:** ${extractedAt}\n**pages:** ${matching.numpages}\n\n---\n\n${matching.text}\n`,
  );
  console.log(`Wrote ${MATCHING_RAW}`);

  const profile = await extractPdf(PROFILE_PDF, "Profile creation guide");
  writeFileSync(
    PROFILE_RAW,
    `# Raw extract — Developer Profile Creation Guide\n\n**extractedAt:** ${extractedAt}\n**pages:** ${profile.numpages}\n\n---\n\n${profile.text}\n`,
  );
  console.log(`Wrote ${PROFILE_RAW}`);

  console.log(
    "Structured rules: sources/toptal-guides/job-application-matching-handbook.md",
  );
  console.log(
    "Structured rules: sources/toptal-guides/developer-profile-creation-guide.md",
  );
}
