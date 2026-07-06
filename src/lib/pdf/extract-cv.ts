import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
) => Promise<{ text: string }>;
import { paths } from "../paths.js";

/** Header marker written by every intake path; used to detect a real extract. */
export const CV_EXTRACTION_MARKER = "**extractedAt:**";

/** True when profile/base-cv.md exists and was produced by an intake path. */
export function isBaseCvExtracted(): boolean {
  if (!existsSync(paths.baseCvMd)) return false;
  return readFileSync(paths.baseCvMd, "utf8").includes(CV_EXTRACTION_MARKER);
}

/** Write profile/base-cv.md from pasted text (no PDF involved). */
export function writeBaseCvFromText(text: string): void {
  const extractedAt = new Date().toISOString();
  const md = `# Base CV (pasted)

${CV_EXTRACTION_MARKER} ${extractedAt}
**source:** pasted text

---

${text.trim()}
`;
  writeFileSync(paths.baseCvMd, md);
  console.log(`Wrote ${paths.baseCvMd} (${text.trim().length} characters)`);
}

export async function runExtractCv(): Promise<void> {
  if (!existsSync(paths.baseCvPdf)) {
    throw new Error(`Missing CV PDF: ${paths.baseCvPdf}`);
  }

  const buffer = readFileSync(paths.baseCvPdf);
  const result = await pdfParse(buffer);
  const text = (result.text ?? "").trim();
  const extractedAt = new Date().toISOString();

  const md = `# Base CV (extracted)

**extractedAt:** ${extractedAt}
**source:** profile/base-cv.pdf

---

${text}
`;

  writeFileSync(paths.baseCvMd, md);
  console.log(`Wrote ${paths.baseCvMd} (${text.length} characters)`);
}
