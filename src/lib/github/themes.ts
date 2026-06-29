const THEME_KEYWORDS = [
  "api",
  "backend",
  "frontend",
  "infra",
  "devops",
  "data",
  "test",
  "docs",
  "security",
  "mobile",
  "platform",
  "react",
  "typescript",
  "css",
  "ui",
  "ux",
  "accessibility",
] as const;

export function inferThemes(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const kw of THEME_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, "i");
    if (re.test(lower)) found.add(kw);
  }
  return [...found].sort();
}
