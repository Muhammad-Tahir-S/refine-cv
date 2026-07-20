import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertNoInternalMetadataInHtml,
  findInternalMetadataLeaksInHtml,
  parseCvMarkdown,
  parseCvMarkdownWithDiagnostics,
  renderCvHtml,
  sanitizeCvMarkdown,
  sanitizeCvMarkdownWithDiagnostics,
} from "../../src/lib/pdf/parse-cv-md.ts";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

describe("sanitizeCvMarkdown", () => {
  it("removes explicit meta markers but preserves italic notes", () => {
    const markdown = [
      "# Name",
      "_Available immediately._",
      "<!-- refine-cv:meta run=123 -->",
      "_Another italic note._",
    ].join("\n");

    const { sanitized, diagnostics } =
      sanitizeCvMarkdownWithDiagnostics(markdown);

    expect(sanitized).toContain("_Available immediately._");
    expect(sanitized).toContain("_Another italic note._");
    expect(sanitized).not.toContain("refine-cv:meta");
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "meta_marker_removed",
          line: 3,
        }),
      ]),
    );
  });

  it("reports removed evidence tags with line numbers", () => {
    const markdown = "- Built APIs `verified-from-github` and dashboards";

    const { sanitized, diagnostics } =
      sanitizeCvMarkdownWithDiagnostics(markdown);

    expect(sanitized).toBe("- Built APIs and dashboards");
    expect(diagnostics).toEqual([
      {
        severity: "warning",
        code: "evidence_tag_removed",
        message: "Removed evidence tag `verified-from-github`",
        line: 1,
      },
    ]);
  });

  it("keeps backward-compatible sanitizeCvMarkdown wrapper", () => {
    const markdown = "_Note_ `needs-your-confirmation` <!-- cv-meta: x -->";
    expect(sanitizeCvMarkdown(markdown)).toBe("_Note_");
  });
});

describe("parseCvMarkdownWithDiagnostics", () => {
  it("parses fixture CV and preserves italic notes", () => {
    const markdown = readFixture("sample-cv.md");
    const { document, diagnostics, sanitizedMarkdown } =
      parseCvMarkdownWithDiagnostics(markdown);

    expect(document.name).toBe("Jane Developer");
    expect(document.subtitle?.[0]).toEqual({
      kind: "text",
      value: "Senior Engineer",
    });
    expect(document.sections.map((section) => section.title)).toEqual([
      "Summary",
      "Professional Experience",
      "Skills",
    ]);

    const summary = document.sections[0]?.blocks ?? [];
    expect(summary.some((block) => block.type === "note")).toBe(true);
    expect(sanitizedMarkdown).toContain("_Italic note preserved in summary._");
    expect(sanitizedMarkdown).not.toContain("verified-from-github");
    expect(sanitizedMarkdown).not.toContain("refine-cv:meta");

    expect(diagnostics.filter((d) => d.code === "evidence_tag_removed")).toHaveLength(
      2,
    );
    expect(diagnostics.filter((d) => d.code === "meta_marker_removed")).toHaveLength(
      1,
    );
  });

  it("emits diagnostics for unsupported markdown constructs", () => {
    const markdown = readFixture("unsupported-markdown.md");
    const { diagnostics } = parseCvMarkdownWithDiagnostics(markdown);
    const codes = diagnostics.map((diagnostic) => diagnostic.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "unsupported_table",
        "unsupported_image",
        "unsupported_nested_list",
        "unsupported_raw_html",
        "unsupported_heading",
      ]),
    );
  });

  it("throws and records missing name heading as an error diagnostic", () => {
    expect(() => parseCvMarkdown("No heading here")).toThrow(
      "CV markdown must start with a '# Name' heading",
    );

    try {
      parseCvMarkdownWithDiagnostics("No heading here");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }

    expect(() => parseCvMarkdownWithDiagnostics("No heading here")).toThrow();
  });

  it("reports orphan content outside section headings", () => {
    const markdown = [
      "# Jane Developer",
      "",
      "## Summary",
      "Ready to work.",
      "",
      "## Skills",
      "- JavaScript",
      "",
      "Orphan trailing content after the last section",
    ].join("\n");

    const { diagnostics } = parseCvMarkdownWithDiagnostics(markdown);

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "orphan_content",
          line: 9,
        }),
      ]),
    );
  });
});

describe("renderCvHtml", () => {
  it("renders fixture CV without internal metadata leaks", () => {
    const markdown = readFixture("sample-cv.md");
    const { document } = parseCvMarkdownWithDiagnostics(markdown);
    const html = renderCvHtml(document, "body { margin: 0; }");

    expect(html).toContain('<h1 class="cv-name">Jane Developer</h1>');
    expect(html).toContain("Italic note preserved in summary.");
    expect(html).toContain("Shipped feature X");
    expect(html).not.toContain("verified-from-github");
    expect(html).not.toContain("needs-your-confirmation");
    expect(html).not.toContain("refine-cv:meta");

    expect(findInternalMetadataLeaksInHtml(html)).toEqual([]);
    expect(() => assertNoInternalMetadataInHtml(html)).not.toThrow();
  });

  it("detects internal metadata leaks in HTML", () => {
    const leaks = findInternalMetadataLeaksInHtml(
      "<p>verified-from-github</p>",
    );

    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.code).toBe("internal_metadata_leak");
    expect(() =>
      assertNoInternalMetadataInHtml("<p>needs-your-confirmation</p>"),
    ).toThrow(/internal metadata/i);
  });
});
