export type InlineSpan =
  | { kind: "text"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "em"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; text: string; href: string };

export type CvBlock =
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "note"; spans: InlineSpan[] }
  | { type: "stack"; label: string; spans: InlineSpan[] }
  | { type: "bullets"; items: InlineSpan[][] }
  | {
      type: "role";
      title: string;
      meta?: InlineSpan[];
      blocks: CvBlock[];
    };

export interface CvSection {
  title: string;
  blocks: CvBlock[];
}

export interface CvDocument {
  name: string;
  subtitle?: InlineSpan[];
  contact?: InlineSpan[];
  sections: CvSection[];
}

const EVIDENCE_TAG_RE =
  /\s*`(?:verified-from-github|needs-your-confirmation)`\s*/gi;
const METADATA_FOOTER_RE = /^_.*_(?:\s*)$/;
const HORIZONTAL_RULE_RE = /^---+\s*$/;

export function sanitizeCvMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const cleaned: string[] = [];

  for (const line of lines) {
    if (METADATA_FOOTER_RE.test(line.trim())) {
      continue;
    }

    const withoutTags = line.replace(EVIDENCE_TAG_RE, "").trimEnd();
    if (withoutTags.trim() === "" && line.trim() !== "") {
      cleaned.push("");
      continue;
    }
    cleaned.push(withoutTags);
  }

  return cleaned.join("\n").trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const pattern =
    /(\*\*(.+?)\*\*|_(.+?)_|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      spans.push({
        kind: "text",
        value: text.slice(lastIndex, match.index),
      });
    }

    if (match[2] !== undefined) {
      spans.push({ kind: "strong", value: match[2] });
    } else if (match[3] !== undefined) {
      spans.push({ kind: "em", value: match[3] });
    } else if (match[4] !== undefined) {
      spans.push({ kind: "code", value: match[4] });
    } else if (match[5] !== undefined && match[6] !== undefined) {
      spans.push({ kind: "link", text: match[5], href: match[6] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    spans.push({ kind: "text", value: text.slice(lastIndex) });
  }

  return spans.length > 0 ? spans : [{ kind: "text", value: text }];
}

function isSubtitleLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("**") &&
    trimmed.endsWith("**") &&
    !trimmed.includes("·") &&
    !trimmed.startsWith("**Stack:")
  );
}

function isRoleMetaLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("**") && trimmed.includes("·");
}

function isStackLine(line: string): boolean {
  return line.trim().startsWith("**Stack:**");
}

function isNoteLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("_") && trimmed.endsWith("_");
}

function parseStackLine(line: string): CvBlock {
  const content = line.trim().replace(/^\*\*Stack:\*\*\s*/, "");
  return {
    type: "stack",
    label: "Stack:",
    spans: parseInline(content),
  };
}

function parseParagraphBlock(line: string): CvBlock {
  if (isNoteLine(line)) {
    const inner = line.trim().slice(1, -1);
    return { type: "note", spans: parseInline(inner) };
  }

  if (isStackLine(line)) {
    return parseStackLine(line);
  }

  return { type: "paragraph", spans: parseInline(line.trim()) };
}

function pushBlock(blocks: CvBlock[], block: CvBlock): void {
  blocks.push(block);
}

export function parseCvMarkdown(markdown: string): CvDocument {
  const sanitized = sanitizeCvMarkdown(markdown);
  const lines = sanitized.split(/\r?\n/);

  let index = 0;
  while (index < lines.length && lines[index]?.trim() === "") {
    index += 1;
  }

  const nameLine = lines[index];
  if (!nameLine?.startsWith("# ")) {
    throw new Error("CV markdown must start with a '# Name' heading");
  }

  const doc: CvDocument = {
    name: nameLine.slice(2).trim(),
    sections: [],
  };
  index += 1;

  const headerLines: string[] = [];
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.startsWith("## ") || HORIZONTAL_RULE_RE.test(line.trim())) {
      break;
    }
    if (line.trim() !== "") {
      headerLines.push(line.trim());
    }
    index += 1;
  }

  if (headerLines[0] && isSubtitleLine(headerLines[0])) {
    doc.subtitle = parseInline(headerLines[0].slice(2, -2).trim());
    doc.contact = parseInline(headerLines.slice(1).join(" "));
  } else if (headerLines.length > 0) {
    doc.contact = parseInline(headerLines.join(" "));
  }

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (HORIZONTAL_RULE_RE.test(line.trim()) || line.trim() === "") {
      index += 1;
      continue;
    }

    if (!line.startsWith("## ")) {
      index += 1;
      continue;
    }

    const section: CvSection = {
      title: line.slice(3).trim(),
      blocks: [],
    };
    index += 1;

    let currentRole: Extract<CvBlock, { type: "role" }> | null = null;
    let bulletBuffer: InlineSpan[][] = [];

    const flushBullets = (target: CvBlock[]): void => {
      if (bulletBuffer.length === 0) {
        return;
      }
      pushBlock(target, { type: "bullets", items: bulletBuffer });
      bulletBuffer = [];
    };

    while (index < lines.length) {
      const currentLine = lines[index] ?? "";
      const trimmed = currentLine.trim();

      if (trimmed === "") {
        index += 1;
        continue;
      }

      if (HORIZONTAL_RULE_RE.test(trimmed)) {
        index += 1;
        continue;
      }

      if (currentLine.startsWith("## ")) {
        break;
      }

      if (currentLine.startsWith("### ")) {
        flushBullets(currentRole?.blocks ?? section.blocks);
        currentRole = {
          type: "role",
          title: currentLine.slice(4).trim(),
          blocks: [],
        };
        pushBlock(section.blocks, currentRole);
        index += 1;
        continue;
      }

      if (currentLine.startsWith("- ")) {
        bulletBuffer.push(parseInline(currentLine.slice(2).trim()));
        index += 1;
        continue;
      }

      flushBullets(currentRole?.blocks ?? section.blocks);

      if (currentRole && isRoleMetaLine(currentLine)) {
        currentRole.meta = parseInline(trimmed);
        index += 1;
        continue;
      }

      const block = parseParagraphBlock(currentLine);
      pushBlock(currentRole?.blocks ?? section.blocks, block);
      index += 1;
    }

    flushBullets(currentRole?.blocks ?? section.blocks);
    doc.sections.push(section);
  }

  return doc;
}

export function renderInlineSpans(spans: InlineSpan[]): string {
  return spans
    .map((span) => {
      switch (span.kind) {
        case "text":
          return escapeHtml(span.value);
        case "strong":
          return `<strong>${escapeHtml(span.value)}</strong>`;
        case "em":
          return `<em>${escapeHtml(span.value)}</em>`;
        case "code":
          return `<span class="inline-code">${escapeHtml(span.value)}</span>`;
        case "link":
          return `<a href="${escapeHtml(span.href)}">${escapeHtml(span.text)}</a>`;
        default:
          return "";
      }
    })
    .join("");
}

function renderBlock(block: CvBlock): string {
  switch (block.type) {
    case "paragraph":
      return `<p class="cv-paragraph">${renderInlineSpans(block.spans)}</p>`;
    case "note":
      return `<p class="cv-note">${renderInlineSpans(block.spans)}</p>`;
    case "stack":
      return `<p class="cv-stack"><span class="cv-stack-label">${escapeHtml(block.label)}</span> ${renderInlineSpans(block.spans)}</p>`;
    case "bullets":
      return `<ul class="cv-bullets">${block.items
        .map((item) => `<li>${renderInlineSpans(item)}</li>`)
        .join("")}</ul>`;
    case "role":
      return `<article class="cv-role">
        <h3 class="cv-role-title">${escapeHtml(block.title)}</h3>
        ${
          block.meta
            ? `<p class="cv-role-meta">${renderInlineSpans(block.meta)}</p>`
            : ""
        }
        ${block.blocks.map(renderBlock).join("\n")}
      </article>`;
    default:
      return "";
  }
}

export function renderCvHtml(doc: CvDocument, css: string): string {
  const sections = doc.sections
    .map(
      (section) => `<section class="cv-section">
        <h2 class="cv-section-title">${escapeHtml(section.title)}</h2>
        ${section.blocks.map(renderBlock).join("\n")}
      </section>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(doc.name)} — CV</title>
  <style>${css}</style>
</head>
<body>
  <main class="cv">
    <header class="cv-header">
      <h1 class="cv-name">${escapeHtml(doc.name)}</h1>
      ${
        doc.subtitle
          ? `<p class="cv-subtitle">${renderInlineSpans(doc.subtitle)}</p>`
          : ""
      }
      ${
        doc.contact
          ? `<p class="cv-contact">${renderInlineSpans(doc.contact)}</p>`
          : ""
      }
    </header>
    ${sections}
  </main>
</body>
</html>`;
}
