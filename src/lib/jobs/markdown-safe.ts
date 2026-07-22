const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function normalizeTextInput(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(CONTROL_CHAR_REGEX, "");
}

function neutralizeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeMarkdownSyntax(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/([*_`~\[\]()#+.!|])/g, "\\$1");
}

export function escapeMarkdownInline(value: string): string {
  return escapeMarkdownSyntax(neutralizeHtml(normalizeTextInput(value)));
}

export function unescapeMarkdownInline(value: string): string {
  return value.replace(/\\([\\*_`~\[\]()#+.!|])/g, "$1");
}

export function escapeMarkdownTableCell(value: string): string {
  return neutralizeHtml(normalizeTextInput(value))
    .replace(/\n/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/([*_`~\[\]()#+.!])/g, "\\$1")
    .replace(/\|/g, "\\|");
}

export function escapeMarkdownHeading(value: string): string {
  return escapeMarkdownInline(normalizeTextInput(value).replace(/[\r\n]+/g, " ")).trim();
}

export function escapeChecklistSegment(value: string): string {
  const normalized = neutralizeHtml(normalizeTextInput(value))
    .replace(/[\r\n]+/g, " ")
    .replace(/—/g, "&mdash;")
    .replace(/\s+/g, " ")
    .trim();
  return escapeMarkdownSyntax(normalized);
}

export function formatChecklistLine(
  checked: boolean,
  company: string,
  title: string,
  url: string,
): string {
  const prefix = checked ? "- [x] " : "- [ ] ";
  const safeUrl = sanitizeHttpUrl(url);
  const segments = [escapeChecklistSegment(company), escapeChecklistSegment(title)];
  if (safeUrl) {
    segments.push(safeUrl);
  }
  return `${prefix}${segments.join(" — ")}`;
}

export function sanitizeHttpUrl(url: string): string | null {
  const trimmed = normalizeTextInput(url).trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.username = "";
    parsed.password = "";
    return parsed.href;
  } catch {
    return null;
  }
}

export function formatMarkdownLink(label: string, url: string): string {
  const safeUrl = sanitizeHttpUrl(url);
  const safeLabel = escapeMarkdownInline(label);
  if (!safeUrl) {
    return safeLabel;
  }
  return `[${safeLabel}](<${safeUrl}>)`;
}

export function formatMarkdownCode(value: string): string {
  return `\`${normalizeTextInput(value).replace(/`/g, "\\`")}\``;
}
