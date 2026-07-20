import { readFileSync, existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import puppeteer from "puppeteer";
import { paths } from "../paths.js";
import {
  assertNoInternalMetadataInHtml,
  parseCvMarkdownWithDiagnostics,
  renderCvHtml,
  type CvRenderDiagnostic,
} from "./parse-cv-md.js";

export interface RenderCvOptions {
  inputPath: string;
  outputPath?: string;
}

export interface RenderCvResult {
  outputPath: string;
  diagnostics: CvRenderDiagnostic[];
}

function defaultOutputPath(inputPath: string): string {
  const parsed = extname(inputPath);
  if (parsed.toLowerCase() === ".md") {
    return inputPath.slice(0, -parsed.length) + ".pdf";
  }
  return `${inputPath}.pdf`;
}

function logDiagnostics(diagnostics: CvRenderDiagnostic[]): void {
  for (const diagnostic of diagnostics) {
    const location =
      diagnostic.line !== undefined ? ` line ${diagnostic.line}:` : ":";
    const prefix = `[cv-render:${diagnostic.code}]${location}`;
    if (diagnostic.severity === "error") {
      console.error(`${prefix} ${diagnostic.message}`);
    } else {
      console.warn(`${prefix} ${diagnostic.message}`);
    }
  }
}

async function launchBrowser() {
  try {
    return await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Could not find Chrome")) {
      throw new Error(
        "Puppeteer Chrome is not installed. Run: pnpm setup:pdf",
        { cause: error },
      );
    }
    throw error;
  }
}

export async function runRenderCv(
  options: RenderCvOptions,
): Promise<RenderCvResult> {
  const inputPath = resolve(options.inputPath);
  if (!existsSync(inputPath)) {
    throw new Error(`Missing CV markdown: ${inputPath}`);
  }

  const outputPath = resolve(
    options.outputPath ?? defaultOutputPath(inputPath),
  );
  const cssPath = paths.cvTemplateCss;
  if (!existsSync(cssPath)) {
    throw new Error(`Missing CV template CSS: ${cssPath}`);
  }

  const markdown = readFileSync(inputPath, "utf8");
  const css = readFileSync(cssPath, "utf8");
  const { document, diagnostics } = parseCvMarkdownWithDiagnostics(markdown);
  logDiagnostics(diagnostics);

  const html = renderCvHtml(document, css);
  assertNoInternalMetadataInHtml(html);

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: outputPath,
      format: "letter",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }

  console.log(`Wrote ${outputPath}`);
  return { outputPath, diagnostics };
}
