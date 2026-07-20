import {
  inferLevelFromFields,
  inferRemoteScopeFromFields,
} from "./filter.js";
import { makeDedupeKeyFromPosting, makeLegacyDedupeKey } from "./dedupe.js";
import type { JobPosting, RawPosting } from "./types.js";

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => HTML_ENTITY_MAP[name.toLowerCase()] ?? match);
}

export function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
}

export function cleanCompanyName(name: string): string {
  return decodeHtmlEntities(name).replace(/\s+/g, " ").trim();
}

export function cleanTitle(title: string): string {
  return decodeHtmlEntities(title).replace(/\s+/g, " ").trim();
}

export function normalizeRawPosting(raw: RawPosting, fetchedAt: string): JobPosting {
  const company = cleanCompanyName(raw.company);
  const title = cleanTitle(raw.title);
  const description = stripHtml(raw.description);
  const location = decodeHtmlEntities(raw.location).trim();
  const dedupeKey = makeDedupeKeyFromPosting({
    sourceId: raw.sourceId,
    sourceJobId: raw.sourceJobId,
    company,
    title,
    url: raw.url,
  });

  return {
    company,
    title,
    url: raw.url,
    listingUrl: raw.listingUrl ?? raw.url,
    location,
    remoteScope: inferRemoteScopeFromFields(location, description),
    level: inferLevelFromFields(title, description),
    description,
    source: raw.sourceId,
    sourceJobId: raw.sourceJobId,
    postedAt: raw.postedAt,
    attribution: raw.attribution,
    fetchedAt,
    dedupeKey,
    legacyDedupeKey: makeLegacyDedupeKey(company, title),
  };
}
