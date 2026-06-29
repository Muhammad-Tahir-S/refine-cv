import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
) => Promise<{ text: string }>;
import { paths } from "../paths.js";

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
