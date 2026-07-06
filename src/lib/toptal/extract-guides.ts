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
const MATCHING_STRUCTURED = paths.toptalMatchingHandbook;
const PROFILE_STRUCTURED = paths.toptalProfileGuide;

async function extractPdf(pdfPath: string, label: string): Promise<{ text: string; numpages: number }> {
  if (!existsSync(pdfPath)) {
    throw new Error(`Missing PDF: ${pdfPath}`);
  }
  const result = await pdfParse(readFileSync(pdfPath));
  const text = (result.text ?? "").trim();
  console.log(`${label}: ${text.length} characters, ${result.numpages} pages`);
  return { text, numpages: result.numpages };
}

function writeStructuredGuide(options: {
  outputPath: string;
  sourceId: string;
  title: string;
  pdfFilename: string;
  extractedAt: string;
  numpages: number;
  text: string;
  purpose: string;
  force: boolean;
}): void {
  if (existsSync(options.outputPath) && !options.force) {
    console.log(`Skipping ${options.outputPath} (already exists; pass --force to overwrite)`);
    return;
  }

  const md = `# ${options.title}

**Source ID:** \`${options.sourceId}\`
**Publisher:** Toptal (Confidential & Proprietary — internal talent guide)
**Extracted:** ${options.extractedAt.slice(0, 10)}
**PDF:** [pdf/${options.pdfFilename}](pdf/${encodeURIComponent(options.pdfFilename)})
**Pages:** ${options.numpages}

${options.purpose}

> Auto-extracted from PDF. Section headings may be imperfect; cross-check with the PDF when precision matters.

---

## Extracted content

${options.text}
`;

  writeFileSync(options.outputPath, md);
  console.log(`Wrote ${options.outputPath}`);
}

export async function runExtractToptalGuides(options?: { force?: boolean }): Promise<void> {
  const force = options?.force ?? false;
  const extractedAt = new Date().toISOString();

  const matching = await extractPdf(MATCHING_PDF, "Matching handbook");
  writeFileSync(
    MATCHING_RAW,
    `# Raw extract — Job Application Matching Process Handbook\n\n**extractedAt:** ${extractedAt}\n**pages:** ${matching.numpages}\n\n---\n\n${matching.text}\n`,
  );
  console.log(`Wrote ${MATCHING_RAW}`);

  writeStructuredGuide({
    outputPath: MATCHING_STRUCTURED,
    sourceId: "toptal-matching-process-pdf",
    title: "Job Application Matching Process Handbook for Developers",
    pdfFilename: "Job Application Matching Process Handbook for Developers.pdf",
    extractedAt,
    numpages: matching.numpages,
    text: matching.text,
    purpose:
      "This is the **primary authority** for Toptal pitch generation and application workflow in refine-cv.",
    force,
  });

  const profile = await extractPdf(PROFILE_PDF, "Profile creation guide");
  writeFileSync(
    PROFILE_RAW,
    `# Raw extract — Developer Profile Creation Guide\n\n**extractedAt:** ${extractedAt}\n**pages:** ${profile.numpages}\n\n---\n\n${profile.text}\n`,
  );
  console.log(`Wrote ${PROFILE_RAW}`);

  writeStructuredGuide({
    outputPath: PROFILE_STRUCTURED,
    sourceId: "toptal-profile-creation-guide-pdf",
    title: "Developer — Profile Creation Guide",
    pdfFilename: "Developer - Profile Creation Guide.pdf",
    extractedAt,
    numpages: profile.numpages,
    text: profile.text,
    purpose:
      "This is the **primary authority** for baseline Toptal profile enhancement in refine-cv.",
    force,
  });
}
