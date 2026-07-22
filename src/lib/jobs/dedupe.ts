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

const TRACKING_QUERY_PARAMS = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "mkt_tok",
  "ref",
  "ref_src",
  "ref_url",
  "_ga",
  "_gl",
  "yclid",
]);

function isTrackingQueryParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || TRACKING_QUERY_PARAMS.has(lower);
}

export function countTrackingQueryParameters(url: string): number {
  try {
    const parsed = new URL(url.trim());
    let count = 0;
    for (const key of parsed.searchParams.keys()) {
      if (isTrackingQueryParam(key)) {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function normalizePathname(pathname: string): string {
  const withoutTrailingSlash = pathname.replace(/\/+$/, "");
  return withoutTrailingSlash === "" ? "/" : withoutTrailingSlash;
}

function buildSortedQueryString(params: URLSearchParams): string {
  const kept: Array<[string, string]> = [];
  for (const [key, value] of params.entries()) {
    if (isTrackingQueryParam(key)) {
      continue;
    }
    kept.push([key, value]);
  }

  kept.sort(
    (left, right) =>
      left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]),
  );

  if (kept.length === 0) {
    return "";
  }

  const query = new URLSearchParams();
  for (const [key, value] of kept) {
    query.append(key, value);
  }
  return query.toString();
}

function stripDefaultPort(parsed: URL): void {
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }
}

/** Legacy canonicalizer — lowercases the full URL and strips all query params. */
export function canonicalizeUrlLegacy(url: string): string {
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

export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.username = "";
    parsed.password = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    stripDefaultPort(parsed);
    parsed.hash = "";
    parsed.search = buildSortedQueryString(parsed.searchParams);
    parsed.pathname = normalizePathname(parsed.pathname);
    return parsed.toString();
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

export function makeLegacyUrlDedupeKey(url: string): string | undefined {
  const canonicalUrl = canonicalizeUrlLegacy(url);
  if (!canonicalUrl.startsWith("http")) {
    return undefined;
  }
  return `url::${canonicalUrl}`;
}

function lookupAliases(
  posting: Pick<JobPosting, "dedupeKey" | "legacyDedupeKey" | "legacyUrlDedupeKey" | "identityAliases">,
): string[] {
  if (posting.identityAliases && posting.identityAliases.length > 0) {
    return posting.identityAliases;
  }

  return [
    posting.dedupeKey,
    posting.legacyDedupeKey,
    posting.legacyUrlDedupeKey,
  ].filter((value): value is string => Boolean(value));
}

export function findInStateMap<T>(
  posting: Pick<
    JobPosting,
    "dedupeKey" | "legacyDedupeKey" | "legacyUrlDedupeKey" | "identityAliases"
  >,
  map: Record<string, T>,
): T | undefined {
  for (const alias of lookupAliases(posting)) {
    const match = map[alias];
    if (match !== undefined) {
      return match;
    }
  }
  return undefined;
}

export function isKnownInState(
  posting: Pick<
    JobPosting,
    "dedupeKey" | "legacyDedupeKey" | "legacyUrlDedupeKey" | "identityAliases"
  >,
  keys: Record<string, unknown>,
): boolean {
  return lookupAliases(posting).some((alias) => Boolean(keys[alias]));
}

export function resolveStateKey(
  posting: Pick<
    JobPosting,
    "dedupeKey" | "legacyDedupeKey" | "legacyUrlDedupeKey" | "identityAliases"
  >,
  map: Record<string, unknown>,
): string | undefined {
  for (const alias of lookupAliases(posting)) {
    if (map[alias] !== undefined) {
      return alias;
    }
  }
  return undefined;
}
