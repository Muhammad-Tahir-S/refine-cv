import {
  inferLevelFromFields,
  inferRemoteScopeFromFields,
} from "./filter.js";
import { computeIdentity } from "./identity.js";
import type { JobPosting, JobProvenance, JobSourceId, RawPosting } from "./types.js";

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export interface NormalizeContext {
  configuredSourceId: string;
  adapterId: JobSourceId;
  fetchedAt: string;
}

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

function resolveNormalizeContext(
  raw: RawPosting,
  contextOrFetchedAt: NormalizeContext | string,
): NormalizeContext {
  if (typeof contextOrFetchedAt === "string") {
    return {
      configuredSourceId: raw.sourceId,
      adapterId: raw.sourceId,
      fetchedAt: contextOrFetchedAt,
    };
  }
  return contextOrFetchedAt;
}

export function normalizeRawPosting(
  raw: RawPosting,
  contextOrFetchedAt: NormalizeContext | string,
): JobPosting {
  const context = resolveNormalizeContext(raw, contextOrFetchedAt);
  const company = cleanCompanyName(raw.company);
  const title = cleanTitle(raw.title);
  const description = stripHtml(raw.description);
  const location = decodeHtmlEntities(raw.location).trim();
  const identity = computeIdentity({
    adapterId: context.adapterId,
    providerSourceJobId: raw.sourceJobId,
    company,
    title,
    url: raw.url,
  });
  const provenance: JobProvenance[] = [
    {
      configuredSourceId: context.configuredSourceId,
      adapterId: context.adapterId,
      providerSourceJobId: raw.sourceJobId,
      originalUrl: raw.url,
      fetchedAt: context.fetchedAt,
    },
  ];

  return {
    company,
    title,
    url: raw.url,
    listingUrl: raw.listingUrl ?? raw.url,
    location,
    remoteScope: inferRemoteScopeFromFields(location, description),
    level: inferLevelFromFields(title, description),
    description,
    source: context.adapterId,
    configuredSourceIds: [context.configuredSourceId],
    provenance,
    sourceJobId: raw.sourceJobId,
    postedAt: raw.postedAt,
    attribution: raw.attribution,
    fetchedAt: context.fetchedAt,
    dedupeKey: identity.dedupeKey,
    legacyDedupeKey: identity.legacyDedupeKey,
    legacyUrlDedupeKey: identity.legacyUrlDedupeKey,
    identityAliases: identity.identityAliases,
  };
}

export function makeTestPosting(
  overrides: Partial<JobPosting> & Pick<JobPosting, "company" | "title" | "url">,
): JobPosting {
  const fetchedAt = overrides.fetchedAt ?? "2026-07-18T12:00:00.000Z";
  const adapterId = overrides.source ?? "jobicy";
  const configuredSourceId =
    overrides.configuredSourceIds?.[0] ?? overrides.provenance?.[0]?.configuredSourceId ?? adapterId;
  const provenance =
    overrides.provenance ??
    ([
      {
        configuredSourceId,
        adapterId,
        providerSourceJobId: overrides.sourceJobId,
        originalUrl: overrides.url,
        fetchedAt,
      },
    ] satisfies JobProvenance[]);
  const identity = computeIdentity({
    adapterId,
    providerSourceJobId: overrides.sourceJobId ?? provenance[0]?.providerSourceJobId,
    company: overrides.company,
    title: overrides.title,
    url: overrides.url,
  });

  return {
    location: overrides.location ?? "Worldwide",
    remoteScope: overrides.remoteScope ?? "global",
    level: overrides.level ?? "senior",
    description: overrides.description ?? "React role",
    listingUrl: overrides.listingUrl ?? overrides.url,
    source: adapterId,
    sourceJobId: overrides.sourceJobId,
    postedAt: overrides.postedAt,
    attribution: overrides.attribution,
    geoEligibility: overrides.geoEligibility,
    fetchedAt,
    company: overrides.company,
    title: overrides.title,
    url: overrides.url,
    configuredSourceIds: overrides.configuredSourceIds ?? [configuredSourceId],
    provenance,
    dedupeKey: overrides.dedupeKey ?? identity.dedupeKey,
    legacyDedupeKey: overrides.legacyDedupeKey ?? identity.legacyDedupeKey,
    legacyUrlDedupeKey: overrides.legacyUrlDedupeKey ?? identity.legacyUrlDedupeKey,
    identityAliases: overrides.identityAliases ?? identity.identityAliases,
  };
}
