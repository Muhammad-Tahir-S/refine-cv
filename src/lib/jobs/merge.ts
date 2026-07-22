import {
  inferLevelFromFields,
  inferRemoteScopeFromFields,
} from "./filter.js";
import {
  canonicalizeUrl,
  countTrackingQueryParameters,
} from "./dedupe.js";
import {
  collectLinkSignals,
  configuredSourceIdsFromProvenance,
  provenanceRecordKey,
  recomputeIdentity,
} from "./identity.js";
import type { DedupeSummary, JobPosting, JobProvenance } from "./types.js";

class UnionFind {
  private readonly parent = new Map<number, number>();

  find(index: number): number {
    const existing = this.parent.get(index);
    if (existing === undefined) {
      this.parent.set(index, index);
      return index;
    }
    if (existing !== index) {
      const root = this.find(existing);
      this.parent.set(index, root);
      return root;
    }
    return index;
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent.set(rootB, rootA);
    }
  }
}

function pickRicherText(current: string, candidate: string): string {
  const left = current.trim();
  const right = candidate.trim();
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  if (left.length !== right.length) {
    return left.length > right.length ? left : right;
  }
  return left.localeCompare(right) <= 0 ? left : right;
}

function pickEarliestIso(current: string | undefined, candidate: string | undefined): string | undefined {
  if (!current) {
    return candidate;
  }
  if (!candidate) {
    return current;
  }
  return current <= candidate ? current : candidate;
}

function pickLatestIso(current: string, candidate: string): string {
  return current >= candidate ? current : candidate;
}

function isPublicHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.endsWith(".local")
  ) {
    return false;
  }

  const ipv4 = normalized.split(".").map(Number);
  if (ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part))) {
    return !(
      ipv4[0] === 10 ||
      ipv4[0] === 127 ||
      (ipv4[0] === 169 && ipv4[1] === 254) ||
      (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
      (ipv4[0] === 192 && ipv4[1] === 168)
    );
  }

  return normalized.includes(".");
}

function urlQuality(value: string): [number, number, number, string, string] {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
    const isPublic = isHttp && isPublicHostname(parsed.hostname);
    const protocolRank =
      isPublic && parsed.protocol === "https:"
        ? 0
        : isPublic
          ? 1
          : isHttp && parsed.protocol === "https:"
            ? 2
            : isHttp
              ? 3
              : 4;
    const canonical = canonicalizeUrl(trimmed);
    return [
      protocolRank,
      countTrackingQueryParameters(trimmed),
      canonical.length,
      canonical,
      trimmed,
    ];
  } catch {
    return [5, 0, trimmed.length, trimmed, trimmed];
  }
}

function compareTuple(
  left: [number, number, number, string, string],
  right: [number, number, number, string, string],
): number {
  return (
    left[0] - right[0] ||
    left[1] - right[1] ||
    left[2] - right[2] ||
    left[3].localeCompare(right[3]) ||
    left[4].localeCompare(right[4])
  );
}

function pickBestUrl(values: Array<string | undefined>): string {
  const candidates = [...new Set(values.map((value) => value?.trim()).filter(
    (value): value is string => Boolean(value),
  ))];
  candidates.sort((left, right) => compareTuple(urlQuality(left), urlQuality(right)));
  return candidates[0] ?? "";
}

function postingStableKey(posting: JobPosting): string {
  return [
    canonicalizeUrl(posting.url),
    ...posting.provenance.map(provenanceRecordKey).sort(),
    posting.company.trim(),
    posting.title.trim(),
    posting.description.trim(),
  ].join("|");
}

function comparePostings(left: JobPosting, right: JobPosting): number {
  return postingStableKey(left).localeCompare(postingStableKey(right));
}

function mergeProvenance(postings: JobPosting[]): JobProvenance[] {
  const seen = new Map<string, JobProvenance>();
  for (const posting of postings) {
    for (const record of posting.provenance) {
      const key = provenanceRecordKey(record);
      if (!seen.has(key)) {
        seen.set(key, record);
      }
    }
  }
  return [...seen.values()].sort((a, b) =>
    provenanceRecordKey(a).localeCompare(provenanceRecordKey(b)),
  );
}

function mergeAttribution(postings: JobPosting[]): string | undefined {
  const values = postings
    .map((posting) => posting.attribution?.trim())
    .filter((value): value is string => Boolean(value));
  if (values.length === 0) {
    return undefined;
  }
  return [...new Set(values)].sort().join(" | ");
}

export function mergeJobPostings(postings: JobPosting[]): JobPosting {
  if (postings.length === 1) {
    return postings[0];
  }

  const ordered = [...postings].sort(comparePostings);
  const provenance = mergeProvenance(ordered);
  const primary = ordered[0];
  const primaryProvenance = provenance[0];

  const merged: JobPosting = {
    company: ordered.reduce((value, posting) => pickRicherText(value, posting.company), ""),
    title: ordered.reduce((value, posting) => pickRicherText(value, posting.title), ""),
    url: pickBestUrl(ordered.map((posting) => posting.url)),
    listingUrl: pickBestUrl(
      ordered.map((posting) => posting.listingUrl ?? posting.url),
    ),
    location: ordered.reduce((value, posting) => pickRicherText(value, posting.location), ""),
    description: ordered.reduce(
      (value, posting) => pickRicherText(value, posting.description),
      "",
    ),
    remoteScope: primary.remoteScope,
    level: primary.level,
    source: primaryProvenance?.adapterId ?? primary.source,
    sourceJobId: primaryProvenance?.providerSourceJobId,
    postedAt: ordered.reduce(
      (value, posting) => pickEarliestIso(value, posting.postedAt),
      ordered.find((posting) => posting.postedAt)?.postedAt,
    ),
    attribution: mergeAttribution(ordered),
    fetchedAt: ordered.reduce(
      (value, posting) => pickLatestIso(value, posting.fetchedAt),
      primary.fetchedAt,
    ),
    provenance,
    configuredSourceIds: configuredSourceIdsFromProvenance(provenance),
    dedupeKey: primary.dedupeKey,
    legacyDedupeKey: primary.legacyDedupeKey,
    legacyUrlDedupeKey: primary.legacyUrlDedupeKey,
    identityAliases: primary.identityAliases,
  };

  merged.remoteScope = inferRemoteScopeFromFields(merged.location, merged.description);
  merged.level = inferLevelFromFields(merged.title, merged.description);

  const identity = recomputeIdentity(merged);
  merged.dedupeKey = identity.dedupeKey;
  merged.legacyDedupeKey = identity.legacyDedupeKey;
  merged.legacyUrlDedupeKey = identity.legacyUrlDedupeKey;
  merged.identityAliases = identity.identityAliases;

  return merged;
}

function configuredSourceIds(posting: JobPosting): string[] {
  return [
    ...new Set(posting.provenance.map((record) => record.configuredSourceId)),
  ];
}

function unionUnambiguousCompanyTitleFallbacks(
  postings: JobPosting[],
  unionFind: UnionFind,
): void {
  const fallbackGroups = new Map<string, number[]>();
  for (let index = 0; index < postings.length; index += 1) {
    const key = postings[index].legacyDedupeKey;
    const group = fallbackGroups.get(key) ?? [];
    group.push(index);
    fallbackGroups.set(key, group);
  }

  for (const indexes of fallbackGroups.values()) {
    const sourceCounts = new Map<string, number>();
    for (const index of indexes) {
      for (const sourceId of configuredSourceIds(postings[index])) {
        sourceCounts.set(sourceId, (sourceCounts.get(sourceId) ?? 0) + 1);
      }
    }

    const isUnambiguous =
      sourceCounts.size >= 2 &&
      [...sourceCounts.values()].every((count) => count === 1);
    if (!isUnambiguous) {
      continue;
    }

    for (let offset = 1; offset < indexes.length; offset += 1) {
      unionFind.union(indexes[0], indexes[offset]);
    }
  }
}

export function dedupePostings(postings: JobPosting[]): {
  postings: JobPosting[];
  summary: DedupeSummary;
} {
  if (postings.length === 0) {
    return {
      postings: [],
      summary: { inputCount: 0, outputCount: 0, mergedCount: 0 },
    };
  }

  const orderedPostings = [...postings].sort(comparePostings);
  const unionFind = new UnionFind();
  const signalToIndex = new Map<string, number>();

  for (let index = 0; index < orderedPostings.length; index += 1) {
    unionFind.find(index);
    for (const signal of collectLinkSignals(orderedPostings[index])) {
      const existing = signalToIndex.get(signal);
      if (existing === undefined) {
        signalToIndex.set(signal, index);
      } else {
        unionFind.union(existing, index);
      }
    }
  }

  unionUnambiguousCompanyTitleFallbacks(orderedPostings, unionFind);

  const groups = new Map<number, JobPosting[]>();
  for (let index = 0; index < orderedPostings.length; index += 1) {
    const root = unionFind.find(index);
    const bucket = groups.get(root) ?? [];
    bucket.push(orderedPostings[index]);
    groups.set(root, bucket);
  }

  const merged = [...groups.values()]
    .map((group) => mergeJobPostings(group))
    .sort((a, b) => a.dedupeKey.localeCompare(b.dedupeKey));

  const outputCount = merged.length;
  const inputCount = postings.length;

  return {
    postings: merged,
    summary: {
      inputCount,
      outputCount,
      mergedCount: inputCount - outputCount,
    },
  };
}
