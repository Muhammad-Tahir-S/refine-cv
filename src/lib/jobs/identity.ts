import {
  canonicalizeUrl,
  canonicalizeUrlLegacy,
  makeLegacyDedupeKey,
  normalizeText,
} from "./dedupe.js";
import type { JobPosting, JobProvenance, JobSourceId } from "./types.js";

export interface IdentityInput {
  adapterId: JobSourceId;
  providerSourceJobId?: string;
  company: string;
  title: string;
  url: string;
}

export interface ComputedIdentity {
  dedupeKey: string;
  legacyDedupeKey: string;
  legacyUrlDedupeKey?: string;
  identityAliases: string[];
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => value.length > 0 && values.indexOf(value) === index);
}

export function makeProviderIdentityKey(
  adapterId: JobSourceId,
  providerSourceJobId: string,
): string {
  return `${adapterId}::${normalizeText(providerSourceJobId)}`;
}

export function makeUrlIdentityKey(url: string): string | undefined {
  const canonicalUrl = canonicalizeUrl(url);
  if (!canonicalUrl.startsWith("http")) {
    return undefined;
  }
  return `url::${canonicalUrl}`;
}

export function makeLegacyUrlIdentityKey(url: string): string | undefined {
  const canonicalUrl = canonicalizeUrlLegacy(url);
  if (!canonicalUrl.startsWith("http")) {
    return undefined;
  }
  return `url::${canonicalUrl}`;
}

export function computeIdentity(input: IdentityInput): ComputedIdentity {
  const legacyDedupeKey = makeLegacyDedupeKey(input.company, input.title);
  const urlKey = makeUrlIdentityKey(input.url);
  const legacyUrlDedupeKey = makeLegacyUrlIdentityKey(input.url);
  const providerKey = input.providerSourceJobId
    ? makeProviderIdentityKey(input.adapterId, input.providerSourceJobId)
    : undefined;

  const dedupeKey =
    urlKey ??
    providerKey ??
    legacyDedupeKey;

  const identityAliases = uniqueStrings([
    dedupeKey,
    legacyDedupeKey,
    ...(urlKey ? [urlKey] : []),
    ...(legacyUrlDedupeKey ? [legacyUrlDedupeKey] : []),
    ...(providerKey ? [providerKey] : []),
  ]);

  return {
    dedupeKey,
    legacyDedupeKey,
    legacyUrlDedupeKey,
    identityAliases,
  };
}

export function collectLinkSignals(posting: JobPosting): string[] {
  const signals: string[] = [];

  for (const record of posting.provenance) {
    if (record.providerSourceJobId) {
      signals.push(
        makeProviderIdentityKey(record.adapterId, record.providerSourceJobId),
      );
    }
    const provenanceUrlKey = makeUrlIdentityKey(record.originalUrl);
    if (provenanceUrlKey) {
      signals.push(provenanceUrlKey);
    }
  }

  const urlKey = makeUrlIdentityKey(posting.url);
  if (urlKey) {
    signals.push(urlKey);
  }

  return uniqueStrings(signals);
}

export function recomputeIdentity(posting: JobPosting): ComputedIdentity {
  const primary = posting.provenance[0];
  const computed = computeIdentity({
    adapterId: primary?.adapterId ?? posting.source,
    providerSourceJobId: primary?.providerSourceJobId ?? posting.sourceJobId,
    company: posting.company,
    title: posting.title,
    url: posting.url,
  });

  const aliasSet = new Set(computed.identityAliases);
  for (const record of posting.provenance) {
    if (record.providerSourceJobId) {
      aliasSet.add(
        makeProviderIdentityKey(record.adapterId, record.providerSourceJobId),
      );
    }
    const currentUrl = makeUrlIdentityKey(record.originalUrl);
    if (currentUrl) {
      aliasSet.add(currentUrl);
    }
    const legacyUrl = makeLegacyUrlIdentityKey(record.originalUrl);
    if (legacyUrl) {
      aliasSet.add(legacyUrl);
    }
  }

  for (const signal of collectLinkSignals(posting)) {
    aliasSet.add(signal);
  }

  return {
    ...computed,
    identityAliases: [...aliasSet].sort(),
  };
}

export function provenanceRecordKey(record: JobProvenance): string {
  return [
    record.configuredSourceId,
    record.adapterId,
    record.providerSourceJobId ?? "",
    record.originalUrl,
    record.fetchedAt,
  ].join("|");
}

export function configuredSourceIdsFromProvenance(
  provenance: JobProvenance[],
): string[] {
  return uniqueStrings(provenance.map((record) => record.configuredSourceId));
}
