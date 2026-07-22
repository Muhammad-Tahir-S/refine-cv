import { describe, expect, it } from "vitest";
import {
  canonicalizeUrl,
  canonicalizeUrlLegacy,
  findInStateMap,
  isKnownInState,
  makeLegacyDedupeKey,
} from "../../src/lib/jobs/dedupe.ts";
import { computeIdentity } from "../../src/lib/jobs/identity.ts";
import { dedupePostings, mergeJobPostings } from "../../src/lib/jobs/merge.ts";
import { makeTestPosting, normalizeRawPosting } from "../../src/lib/jobs/normalize.ts";
import { attachSourceMatchCounts } from "../../src/lib/jobs/pipeline.ts";
import type { JobPosting, SourceStats } from "../../src/lib/jobs/types.ts";

function postingFromRaw(
  raw: Parameters<typeof normalizeRawPosting>[0],
  context: Parameters<typeof normalizeRawPosting>[1],
): JobPosting {
  return normalizeRawPosting(raw, context);
}

describe("canonicalizeUrl", () => {
  it("preserves path case while lowercasing scheme and host", () => {
    expect(canonicalizeUrl("https://Example.com/Jobs/React/")).toBe(
      "https://example.com/Jobs/React",
    );
  });

  it("removes tracking params but keeps meaningful query params in deterministic order", () => {
    expect(
      canonicalizeUrl(
        "https://example.com/apply?role=frontend&utm_source=newsletter&team=platform",
      ),
    ).toBe("https://example.com/apply?role=frontend&team=platform");
    expect(
      canonicalizeUrl(
        "https://example.com/apply?team=platform&role=frontend&utm_campaign=spring",
      ),
    ).toBe("https://example.com/apply?role=frontend&team=platform");
  });

  it("strips default ports and fragments", () => {
    expect(canonicalizeUrl("https://example.com:443/jobs/1#section")).toBe(
      "https://example.com/jobs/1",
    );
    expect(canonicalizeUrl("http://example.com:80/jobs/1")).toBe("http://example.com/jobs/1");
  });

  it("falls back safely for invalid URLs", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
  });
});

describe("legacy URL alias compatibility", () => {
  it("exposes legacy URL keys from the old canonicalizer", () => {
    const posting = postingFromRaw(
      {
        sourceId: "jobicy",
        sourceJobId: "1",
        company: "Acme",
        title: "React Engineer",
        url: "https://Example.com/Jobs/1/?utm_source=x",
        location: "Remote",
        description: "React",
      },
      {
        configuredSourceId: "jobicy",
        adapterId: "jobicy",
        fetchedAt: "2026-07-20T10:00:00.000Z",
      },
    );

    expect(posting.dedupeKey).toBe("url::https://example.com/Jobs/1");
    expect(posting.legacyUrlDedupeKey).toBe("url::https://example.com/jobs/1");
    expect(posting.identityAliases).toContain(posting.legacyUrlDedupeKey);
  });

  it("matches prior scan state stored under legacy URL keys", () => {
    const posting = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://Example.com/Jobs/1/?utm_source=x",
    });
    const legacyKey = posting.legacyUrlDedupeKey!;
    const seen = {
      [legacyKey]: {
        dedupeKey: legacyKey,
        company: "Acme",
        title: "React Engineer",
        url: posting.url,
        firstSeenAt: "2026-07-01T00:00:00.000Z",
        lastSeenAt: "2026-07-01T00:00:00.000Z",
      },
    };

    expect(isKnownInState(posting, seen)).toBe(true);
    expect(findInStateMap(posting, seen)?.dedupeKey).toBe(legacyKey);
  });

  it("keeps legacy canonicalizer behavior for migration lookups", () => {
    expect(canonicalizeUrlLegacy("https://Example.com/Jobs/1/?role=frontend")).toBe(
      "https://example.com/jobs/1",
    );
  });
});

describe("provenance and configured source IDs", () => {
  it("stores configured source ID separately from adapter ID", () => {
    const posting = postingFromRaw(
      {
        sourceId: "jobicy",
        sourceJobId: "42",
        company: "Acme",
        title: "React Engineer",
        url: "https://example.com/jobs/42",
        location: "Remote",
        description: "React",
      },
      {
        configuredSourceId: "jobicy-react",
        adapterId: "jobicy",
        fetchedAt: "2026-07-20T10:00:00.000Z",
      },
    );

    expect(posting.source).toBe("jobicy");
    expect(posting.configuredSourceIds).toEqual(["jobicy-react"]);
    expect(posting.provenance[0]).toEqual({
      configuredSourceId: "jobicy-react",
      adapterId: "jobicy",
      providerSourceJobId: "42",
      originalUrl: "https://example.com/jobs/42",
      fetchedAt: "2026-07-20T10:00:00.000Z",
    });
  });
});

describe("dedupePostings", () => {
  it("merges same-source provider-ID duplicates", () => {
    const first = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/a",
      sourceJobId: "42",
      source: "jobicy",
      description: "Short",
      provenance: [
        {
          configuredSourceId: "jobicy",
          adapterId: "jobicy",
          providerSourceJobId: "42",
          originalUrl: "https://example.com/jobs/a",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });
    const second = makeTestPosting({
      ...first,
      url: "https://example.com/jobs/b",
      description: "Much longer React description with more detail",
      provenance: [
        {
          configuredSourceId: "jobicy",
          adapterId: "jobicy",
          providerSourceJobId: "42",
          originalUrl: "https://example.com/jobs/b",
          fetchedAt: "2026-07-20T11:00:00.000Z",
        },
      ],
    });

    const { postings, summary } = dedupePostings([first, second]);
    expect(summary.mergedCount).toBe(1);
    expect(postings).toHaveLength(1);
    expect(postings[0].description).toBe("Much longer React description with more detail");
    expect(postings[0].provenance).toHaveLength(2);
  });

  it("merges cross-source canonical URL duplicates", () => {
    const remotive = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/apply?role=frontend&utm_source=remotive",
      source: "remotive",
      configuredSourceIds: ["remotive"],
      provenance: [
        {
          configuredSourceId: "remotive",
          adapterId: "remotive",
          providerSourceJobId: "r-1",
          originalUrl: "https://example.com/apply?role=frontend&utm_source=remotive",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });
    const jobicy = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/apply?role=frontend&utm_source=jobicy",
      source: "jobicy",
      configuredSourceIds: ["jobicy"],
      provenance: [
        {
          configuredSourceId: "jobicy",
          adapterId: "jobicy",
          providerSourceJobId: "j-1",
          originalUrl: "https://example.com/apply?role=frontend&utm_source=jobicy",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });

    const { postings } = dedupePostings([remotive, jobicy]);
    expect(postings).toHaveLength(1);
    expect(postings[0].configuredSourceIds.sort()).toEqual(["jobicy", "remotive"]);
    expect(postings[0].provenance).toHaveLength(2);
  });

  it("merges transitively linked duplicates", () => {
    const byProvider = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/a",
      sourceJobId: "shared-99",
      source: "jobicy",
      provenance: [
        {
          configuredSourceId: "jobicy",
          adapterId: "jobicy",
          providerSourceJobId: "shared-99",
          originalUrl: "https://example.com/a",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });
    const byUrl = makeTestPosting({
      company: "Acme Corp",
      title: "Senior React Engineer",
      url: "https://example.com/shared",
      source: "remotive",
      provenance: [
        {
          configuredSourceId: "remotive",
          adapterId: "remotive",
          providerSourceJobId: "r-2",
          originalUrl: "https://example.com/shared",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });
    const byTitle = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/shared",
      source: "wwr",
      provenance: [
        {
          configuredSourceId: "wwr",
          adapterId: "wwr",
          providerSourceJobId: "shared-99",
          originalUrl: "https://example.com/shared",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });

    const { postings } = dedupePostings([byProvider, byUrl, byTitle]);
    expect(postings).toHaveLength(1);
    expect(postings[0].provenance).toHaveLength(3);
    expect(postings[0].title).toBe("Senior React Engineer");
  });

  it("uses company/title fallback only as a cautious cross-source link", () => {
    const first = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/one",
      source: "jobicy",
      provenance: [
        {
          configuredSourceId: "jobicy",
          adapterId: "jobicy",
          providerSourceJobId: "1",
          originalUrl: "https://example.com/jobs/one",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });
    const second = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/two",
      source: "remotive",
      provenance: [
        {
          configuredSourceId: "remotive",
          adapterId: "remotive",
          providerSourceJobId: "2",
          originalUrl: "https://example.com/jobs/two",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });

    const { postings } = dedupePostings([first, second]);
    expect(postings).toHaveLength(1);
    expect(makeLegacyDedupeKey("Acme", "React Engineer")).toBe(first.legacyDedupeKey);
  });

  it("does not merge distinct same-source postings by company/title", () => {
    const first = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/one",
      sourceJobId: "1",
      source: "jobicy",
    });
    const second = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/two",
      sourceJobId: "2",
      source: "jobicy",
    });

    const { postings } = dedupePostings([first, second]);
    expect(postings).toHaveLength(2);
  });

  it("does not apply company/title fallback to ambiguous A,A,B groups", () => {
    const firstA = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/a-one",
      sourceJobId: "a-1",
      source: "jobicy",
    });
    const secondA = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/a-two",
      sourceJobId: "a-2",
      source: "jobicy",
    });
    const onlyB = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/b",
      sourceJobId: "b-1",
      source: "remotive",
      configuredSourceIds: ["remotive"],
      provenance: [
        {
          configuredSourceId: "remotive",
          adapterId: "remotive",
          providerSourceJobId: "b-1",
          originalUrl: "https://example.com/jobs/b",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });

    const { postings } = dedupePostings([firstA, secondA, onlyB]);
    expect(postings).toHaveLength(3);
  });
});

describe("mergeJobPostings", () => {
  it("retains all provenance and recomputes identity aliases", () => {
    const first = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/1",
      postedAt: "2026-07-10T00:00:00.000Z",
      fetchedAt: "2026-07-20T10:00:00.000Z",
      provenance: [
        {
          configuredSourceId: "jobicy",
          adapterId: "jobicy",
          providerSourceJobId: "1",
          originalUrl: "https://example.com/jobs/1",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });
    const second = makeTestPosting({
      company: "Acme Inc",
      title: "Senior React Engineer",
      url: "https://example.com/jobs/1?ref=board",
      location: "Worldwide, open to Nigeria",
      description: "Longer description with more context",
      postedAt: "2026-07-05T00:00:00.000Z",
      fetchedAt: "2026-07-20T11:00:00.000Z",
      provenance: [
        {
          configuredSourceId: "remotive",
          adapterId: "remotive",
          providerSourceJobId: "9",
          originalUrl: "https://example.com/jobs/1?ref=board",
          fetchedAt: "2026-07-20T11:00:00.000Z",
        },
      ],
    });

    const merged = mergeJobPostings([first, second]);
    expect(merged.provenance).toHaveLength(2);
    expect(merged.company).toBe("Acme Inc");
    expect(merged.title).toBe("Senior React Engineer");
    expect(merged.description).toBe("Longer description with more context");
    expect(merged.location).toBe("Worldwide, open to Nigeria");
    expect(merged.postedAt).toBe("2026-07-05T00:00:00.000Z");
    expect(merged.fetchedAt).toBe("2026-07-20T11:00:00.000Z");
    expect(merged.identityAliases).toContain(merged.dedupeKey);
    expect(merged.identityAliases).toContain(merged.legacyDedupeKey);
  });

  it("adds current and legacy URL aliases for every provenance URL", () => {
    const first = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/apply?role=frontend",
      source: "jobicy",
    });
    const second = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/apply?role=platform",
      source: "remotive",
      configuredSourceIds: ["remotive"],
      provenance: [
        {
          configuredSourceId: "remotive",
          adapterId: "remotive",
          providerSourceJobId: "r-2",
          originalUrl: "https://example.com/apply?role=platform",
          fetchedAt: "2026-07-20T11:00:00.000Z",
        },
      ],
    });

    const forward = mergeJobPostings([first, second]);
    const reversed = mergeJobPostings([second, first]);
    const alternateUrlKey = "url::https://example.com/apply?role=platform";
    const priorState = { [alternateUrlKey]: { dedupeKey: alternateUrlKey } };

    expect(forward.identityAliases).toContain(
      "url::https://example.com/apply?role=frontend",
    );
    expect(forward.identityAliases).toContain(alternateUrlKey);
    expect(forward.identityAliases).toContain("url::https://example.com/apply");
    expect(reversed.identityAliases).toEqual(forward.identityAliases);
    expect(isKnownInState(reversed, priorState)).toBe(true);
  });

  it("produces stable merged fields and identity regardless of input order", () => {
    const alpha = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://jobs.example.com/opening?team=alpha",
      location: "Remote East",
      description: "Build alpha",
      sourceJobId: "a",
      source: "jobicy",
      configuredSourceIds: ["alpha-source"],
      provenance: [
        {
          configuredSourceId: "alpha-source",
          adapterId: "jobicy",
          providerSourceJobId: "a",
          originalUrl: "https://jobs.example.com/opening?team=alpha",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });
    const omega = makeTestPosting({
      company: "Zeal",
      title: "React Engineer",
      url: "https://jobs.example.com/opening?team=omega",
      location: "Remote West",
      description: "Build omega",
      sourceJobId: "z",
      source: "remotive",
      configuredSourceIds: ["omega-source"],
      provenance: [
        {
          configuredSourceId: "omega-source",
          adapterId: "remotive",
          providerSourceJobId: "z",
          originalUrl: "https://jobs.example.com/opening?team=omega",
          fetchedAt: "2026-07-20T11:00:00.000Z",
        },
      ],
    });

    const forward = mergeJobPostings([alpha, omega]);
    const reversed = mergeJobPostings([omega, alpha]);
    const stable = (posting: JobPosting) => ({
      company: posting.company,
      title: posting.title,
      url: posting.url,
      listingUrl: posting.listingUrl,
      location: posting.location,
      description: posting.description,
      source: posting.source,
      sourceJobId: posting.sourceJobId,
      postedAt: posting.postedAt,
      fetchedAt: posting.fetchedAt,
      configuredSourceIds: posting.configuredSourceIds,
      provenance: posting.provenance,
      dedupeKey: posting.dedupeKey,
      legacyDedupeKey: posting.legacyDedupeKey,
      legacyUrlDedupeKey: posting.legacyUrlDedupeKey,
      identityAliases: posting.identityAliases,
    });

    expect(stable(reversed)).toEqual(stable(forward));
    expect(forward.company).toBe("Acme");
    expect(forward.location).toBe("Remote East");
    expect(forward.description).toBe("Build alpha");
  });

  it("derives legacy source and provider ID from the same primary provenance record", () => {
    const primaryWithoutId = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://jobs.example.com/opening?team=alpha",
      source: "jobicy",
      configuredSourceIds: ["alpha-source"],
      provenance: [
        {
          configuredSourceId: "alpha-source",
          adapterId: "jobicy",
          originalUrl: "https://jobs.example.com/opening?team=alpha",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });
    const secondaryWithId = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://jobs.example.com/opening?team=omega",
      source: "remotive",
      sourceJobId: "remotive-42",
      configuredSourceIds: ["omega-source"],
      provenance: [
        {
          configuredSourceId: "omega-source",
          adapterId: "remotive",
          providerSourceJobId: "remotive-42",
          originalUrl: "https://jobs.example.com/opening?team=omega",
          fetchedAt: "2026-07-20T11:00:00.000Z",
        },
      ],
    });

    const forward = mergeJobPostings([primaryWithoutId, secondaryWithId]);
    const reversed = mergeJobPostings([secondaryWithId, primaryWithoutId]);

    expect({ source: forward.source, sourceJobId: forward.sourceJobId }).toEqual({
      source: "jobicy",
      sourceJobId: undefined,
    });
    expect({ source: reversed.source, sourceJobId: reversed.sourceJobId }).toEqual({
      source: "jobicy",
      sourceJobId: undefined,
    });
    expect(reversed.provenance).toEqual(forward.provenance);
    expect(forward.provenance[1]).toMatchObject({
      adapterId: "remotive",
      providerSourceJobId: "remotive-42",
    });
  });

  it("prefers a clean public HTTPS URL over tracking-heavy alternatives", () => {
    const tracked = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://jobs.example.com/opening?utm_source=board&fbclid=abc",
      source: "jobicy",
    });
    const clean = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://jobs.example.com/opening",
      source: "remotive",
      configuredSourceIds: ["remotive"],
      provenance: [
        {
          configuredSourceId: "remotive",
          adapterId: "remotive",
          providerSourceJobId: "clean",
          originalUrl: "https://jobs.example.com/opening",
          fetchedAt: "2026-07-20T11:00:00.000Z",
        },
      ],
    });

    const merged = mergeJobPostings([tracked, clean]);
    expect(merged.url).toBe("https://jobs.example.com/opening");
  });
});

describe("attachSourceMatchCounts", () => {
  it("counts matched jobs by configured source IDs", () => {
    const merged = makeTestPosting({
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/shared",
      configuredSourceIds: ["jobicy", "remotive"],
      provenance: [
        {
          configuredSourceId: "jobicy",
          adapterId: "jobicy",
          providerSourceJobId: "1",
          originalUrl: "https://example.com/jobs/shared",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
        {
          configuredSourceId: "remotive",
          adapterId: "remotive",
          providerSourceJobId: "2",
          originalUrl: "https://example.com/jobs/shared",
          fetchedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
    });
    const stats: SourceStats[] = [
      {
        sourceId: "jobicy",
        adapter: "jobicy",
        status: "success",
        fetched: 1,
        normalized: 1,
        quarantined: 0,
        matched: 0,
        durationMs: 1,
        failed: false,
        requestUrls: [],
      },
      {
        sourceId: "remotive",
        adapter: "remotive",
        status: "success",
        fetched: 1,
        normalized: 1,
        quarantined: 0,
        matched: 0,
        durationMs: 1,
        failed: false,
        requestUrls: [],
      },
      {
        sourceId: "wwr",
        adapter: "wwr",
        status: "success",
        fetched: 1,
        normalized: 1,
        quarantined: 0,
        matched: 0,
        durationMs: 1,
        failed: false,
        requestUrls: [],
      },
    ];

    const updated = attachSourceMatchCounts(stats, [merged]);
    expect(updated.find((stat) => stat.sourceId === "jobicy")?.matched).toBe(1);
    expect(updated.find((stat) => stat.sourceId === "remotive")?.matched).toBe(1);
    expect(updated.find((stat) => stat.sourceId === "wwr")?.matched).toBe(0);
  });
});

describe("computeIdentity", () => {
  it("prefers URL keys over provider and legacy keys", () => {
    const identity = computeIdentity({
      adapterId: "jobicy",
      providerSourceJobId: "99",
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/99",
    });
    expect(identity.dedupeKey).toBe("url::https://example.com/jobs/99");
    expect(identity.identityAliases).toContain(makeLegacyDedupeKey("Acme", "React Engineer"));
  });
});
