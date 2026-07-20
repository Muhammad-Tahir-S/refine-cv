import type { JobPosting, RawPosting } from "./types.js";

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s/+.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function makeLegacyDedupeKey(company: string, title: string): string {
  return `${normalizeText(company)}::${normalizeText(title)}`;
}

/** @deprecated Use makeLegacyDedupeKey or makeDedupeKeyFromPosting */
export function makeDedupeKey(company: string, title: string): string {
  return makeLegacyDedupeKey(company, title);
}

export function normalizeCompanyName(name: string): string {
  return normalizeText(name);
}

export function isBlocklisted(company: string, blocklist: string[]): boolean {
  const normalized = normalizeCompanyName(company);
  return blocklist.some((entry) => normalizeCompanyName(entry) === normalized);
}

export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.search = "";
    let pathname = parsed.pathname.replace(/\/+$/, "");
    if (pathname === "") {
      pathname = "/";
    }
    parsed.pathname = pathname;
    return parsed.toString().toLowerCase();
  } catch {
    return normalizeText(url);
  }
}

export function makeDedupeKeyFromPosting(
  posting: Pick<RawPosting, "sourceId" | "sourceJobId" | "company" | "title" | "url">,
): string {
  const canonicalUrl = canonicalizeUrl(posting.url);
  if (canonicalUrl.startsWith("http")) {
    return `url::${canonicalUrl}`;
  }
  if (posting.sourceJobId) {
    return `${posting.sourceId}::${normalizeText(posting.sourceJobId)}`;
  }
  return makeLegacyDedupeKey(posting.company, posting.title);
}

export function isKnownInState(
  posting: Pick<JobPosting, "dedupeKey" | "legacyDedupeKey">,
  keys: Record<string, unknown>,
): boolean {
  if (keys[posting.dedupeKey]) {
    return true;
  }
  if (posting.legacyDedupeKey && keys[posting.legacyDedupeKey]) {
    return true;
  }
  return false;
}
