export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s/+.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function makeDedupeKey(company: string, title: string): string {
  return `${normalizeText(company)}::${normalizeText(title)}`;
}

export function normalizeCompanyName(name: string): string {
  return normalizeText(name);
}

export function isBlocklisted(company: string, blocklist: string[]): boolean {
  const normalized = normalizeCompanyName(company);
  return blocklist.some((entry) => normalizeCompanyName(entry) === normalized);
}
