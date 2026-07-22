import { createRequire } from "node:module";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { afterAll, describe, expect, it } from "vitest";
import {
  assertNoInternalMetadataInHtml,
  parseCvMarkdownWithDiagnostics,
  renderCvHtml,
} from "../../src/lib/pdf/parse-cv-md.ts";
import { paths } from "../../src/lib/paths.ts";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
) => Promise<{ text: string }>;

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const FIXTURE_MARKDOWN = readFileSync(
  join(FIXTURE_DIR, "sample-cv.md"),
  "utf8",
);

async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

describe("render CV PDF integration", () => {
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;

  afterAll(async () => {
    await browser?.close();
  });

  it("renders fixture markdown to PDF with expected text and no metadata leaks", async () => {
    try {
      browser = await launchBrowser();
    } catch (error) {
      // Skip when Chrome is missing or the environment cannot launch a browser
      // (sandboxed CI agents, restricted sandboxes, etc.).
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("Could not find Chrome") ||
        message.includes("Failed to launch the browser process")
      ) {
        return;
      }
      throw error;
    }

    const css = readFileSync(paths.cvTemplateCss, "utf8");
    const { document, diagnostics } =
      parseCvMarkdownWithDiagnostics(FIXTURE_MARKDOWN);
    const html = renderCvHtml(document, css);
    assertNoInternalMetadataInHtml(html);

    expect(diagnostics.some((d) => d.code === "evidence_tag_removed")).toBe(
      true,
    );

    const tempDir = mkdtempSync(join(tmpdir(), "refine-cv-render-"));
    const outputPath = join(tempDir, "sample-cv.pdf");

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: outputPath,
      format: "letter",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await page.close();

    const pdfText = (await pdfParse(readFileSync(outputPath))).text;

    expect(pdfText).toMatch(/Jane Developer/i);
    expect(pdfText).toMatch(/Summary/i);
    expect(pdfText).toMatch(/Shipped feature X/i);
    expect(pdfText).toMatch(/Italic note preserved in summary/i);
    expect(pdfText).not.toMatch(/verified-from-github/i);
    expect(pdfText).not.toMatch(/needs-your-confirmation/i);
    expect(pdfText).not.toMatch(/refine-cv:meta/i);
  }, 60_000);
});
