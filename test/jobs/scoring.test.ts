import { describe, expect, it } from "vitest";
import { filterPostings } from "../../src/lib/jobs/filter.ts";
import { normalizeRawPosting } from "../../src/lib/jobs/normalize.ts";
import { loadAndCompileScanPolicy } from "../../src/lib/jobs/scan-policy.ts";
import type { JobPosting } from "../../src/lib/jobs/types.ts";
import { paths } from "../../src/lib/paths.ts";
import {
  compareRankedJobs,
  computeEffectivenessMetrics,
  LIKELY_EXPIRED_DAYS,
  rankMatchedJobs,
  scoreFreshness,
  scoreGeoConfidence,
  scoreJobPosting,
  scoreRelevance,
} from "../../src/lib/jobs/scoring.ts";

function makePosting(
  overrides: Partial<JobPosting> & Pick<JobPosting, "title" | "description">,
): JobPosting {
  const base = normalizeRawPosting(
    {
      sourceId: "jobicy",
      sourceJobId: "test-1",
      company: overrides.company ?? "Acme",
      title: overrides.title,
      url: overrides.url ?? "https://example.com/jobs/1",
      location: overrides.location ?? "Worldwide",
      description: overrides.description,
      postedAt: overrides.postedAt,
    },
    {
      configuredSourceId: "jobicy",
      adapterId: "jobicy",
      fetchedAt: "2026-07-20T10:00:00.000Z",
    },
  );
  return {
    ...base,
    ...overrides,
    configuredSourceIds: overrides.configuredSourceIds ?? ["jobicy"],
    geoEligibility: overrides.geoEligibility,
  };
}

describe("scoreRelevance", () => {
  it("scores React titles higher than backend titles under reactFrontend policy", () => {
    const react = scoreRelevance(
      { title: "Senior React Engineer", description: "React and TypeScript." },
      "reactFrontend",
    );
    const backend = scoreRelevance(
      { title: "Senior Node.js Backend Engineer", description: "Node.js APIs." },
      "reactFrontend",
    );
    expect(react.score).toBeGreaterThan(backend.score);
  });

  it("scores Node.js titles higher than frontend titles under nodejsBackend policy", () => {
    const backend = scoreRelevance(
      { title: "Senior Node.js Engineer", description: "NestJS and Express." },
      "nodejsBackend",
    );
    const react = scoreRelevance(
      { title: "Senior React Engineer", description: "React UI work." },
      "nodejsBackend",
    );
    expect(backend.score).toBeGreaterThan(react.score);
  });
});

describe("scoreGeoConfidence", () => {
  it("ranks worldwide and Nigeria signals above vague EMEA", () => {
    const worldwide = scoreGeoConfidence(
      makePosting({
        title: "Engineer",
        description: "Work from anywhere worldwide.",
        location: "Worldwide",
        remoteScope: "global",
        geoEligibility: "nigeria_eligible",
      }),
    );
    const nigeria = scoreGeoConfidence(
      makePosting({
        title: "Engineer",
        description: "Open to candidates in Nigeria.",
        location: "Remote",
        remoteScope: "global",
        geoEligibility: "nigeria_eligible",
      }),
    );
    const emea = scoreGeoConfidence(
      makePosting({
        title: "Engineer",
        description: "Remote across EMEA timezones.",
        location: "Home based - EMEA",
        remoteScope: "emea",
        geoEligibility: "verify_geo",
      }),
    );

    expect(nigeria.score).toBeGreaterThan(emea.score);
    expect(worldwide.score).toBeGreaterThanOrEqual(emea.score);
    expect(nigeria.score).toBeGreaterThanOrEqual(worldwide.score);
  });
});

describe("scoreFreshness", () => {
  const referenceDate = new Date("2026-07-20T12:00:00.000Z");

  it("decays freshness with listing age", () => {
    const fresh = scoreFreshness(
      { postedAt: "2026-07-18T00:00:00.000Z", fetchedAt: referenceDate.toISOString() },
      referenceDate,
    );
    const stale = scoreFreshness(
      { postedAt: "2026-06-15T00:00:00.000Z", fetchedAt: referenceDate.toISOString() },
      referenceDate,
    );
    expect(fresh.score).toBeGreaterThan(stale.score);
    expect(stale.likelyExpired).toBe(false);
  });

  it("flags likelyExpired after threshold and handles missing postedAt", () => {
    const expired = scoreFreshness(
      {
        postedAt: "2026-01-01T00:00:00.000Z",
        fetchedAt: referenceDate.toISOString(),
      },
      referenceDate,
    );
    expect(expired.likelyExpired).toBe(true);
    expect(expired.score).toBeLessThan(0.4);

    const missing = scoreFreshness(
      { fetchedAt: referenceDate.toISOString() },
      referenceDate,
    );
    expect(missing.likelyExpired).toBe(false);
    expect(missing.score).toBe(0.4);
    expect(missing.reasons[0]).toContain("No postedAt");
  });

  it("uses LIKELY_EXPIRED_DAYS threshold boundary", () => {
    const justUnder = new Date(referenceDate);
    justUnder.setDate(justUnder.getDate() - LIKELY_EXPIRED_DAYS);
    const under = scoreFreshness(
      { postedAt: justUnder.toISOString(), fetchedAt: referenceDate.toISOString() },
      referenceDate,
    );
    expect(under.likelyExpired).toBe(false);

    const justOver = new Date(referenceDate);
    justOver.setDate(justOver.getDate() - (LIKELY_EXPIRED_DAYS + 1));
    const over = scoreFreshness(
      { postedAt: justOver.toISOString(), fetchedAt: referenceDate.toISOString() },
      referenceDate,
    );
    expect(over.likelyExpired).toBe(true);
  });
});

describe("rankMatchedJobs", () => {
  const referenceDate = new Date("2026-07-20T12:00:00.000Z");

  it("sorts nigeria_eligible before verify_geo, then by total score", () => {
    const verify = makePosting({
      title: "Senior React Engineer",
      description: "React role worldwide.",
      location: "Worldwide",
      remoteScope: "global",
      geoEligibility: "verify_geo",
      postedAt: "2026-07-19T00:00:00.000Z",
    });
    const eligibleWeak = makePosting({
      title: "Frontend Developer",
      description: "React.",
      location: "Remote",
      remoteScope: "unknown",
      geoEligibility: "nigeria_eligible",
      postedAt: "2026-06-01T00:00:00.000Z",
      company: "Beta",
    });
    const eligibleStrong = makePosting({
      title: "Senior React Engineer",
      description: "React and Next.js worldwide.",
      location: "Worldwide",
      remoteScope: "global",
      geoEligibility: "nigeria_eligible",
      postedAt: "2026-07-19T00:00:00.000Z",
      company: "Alpha",
    });

    const ranked = rankMatchedJobs(
      [verify, eligibleWeak, eligibleStrong],
      "reactFrontend",
      referenceDate,
    );

    expect(ranked[0]?.posting.dedupeKey).toBe(eligibleStrong.dedupeKey);
    expect(ranked[1]?.posting.dedupeKey).toBe(eligibleWeak.dedupeKey);
    expect(ranked[2]?.posting.dedupeKey).toBe(verify.dedupeKey);
  });

  it("produces stable deterministic ordering for ties", () => {
    const a = makePosting({
      company: "Alpha",
      title: "Senior React Engineer",
      description: "React worldwide.",
      location: "Worldwide",
      remoteScope: "global",
      geoEligibility: "nigeria_eligible",
      postedAt: "2026-07-19T00:00:00.000Z",
    });
    const b = makePosting({
      company: "Beta",
      title: "Senior React Engineer",
      description: "React worldwide.",
      location: "Worldwide",
      remoteScope: "global",
      geoEligibility: "nigeria_eligible",
      postedAt: "2026-07-19T00:00:00.000Z",
    });

    const first = rankMatchedJobs([b, a], "reactFrontend", referenceDate);
    const second = rankMatchedJobs([a, b], "reactFrontend", referenceDate);
    expect(first.map((row) => row.posting.dedupeKey)).toEqual(
      second.map((row) => row.posting.dedupeKey),
    );
    expect(first[0]?.posting.company).toBe("Alpha");
  });

  it("compareRankedJobs is transitive for geo tier then score", () => {
    const low = {
      posting: makePosting({
        title: "React Dev",
        description: "React",
        geoEligibility: "verify_geo",
        remoteScope: "emea",
        location: "EMEA",
      }),
      score: scoreJobPosting(
        makePosting({
          title: "React Dev",
          description: "React",
          geoEligibility: "verify_geo",
          remoteScope: "emea",
          location: "EMEA",
        }),
        "reactFrontend",
        referenceDate,
      ),
    };
    const high = {
      posting: makePosting({
        title: "Senior React Engineer",
        description: "React worldwide",
        geoEligibility: "nigeria_eligible",
        remoteScope: "global",
        location: "Worldwide",
        postedAt: "2026-07-19T00:00:00.000Z",
      }),
      score: scoreJobPosting(
        makePosting({
          title: "Senior React Engineer",
          description: "React worldwide",
          geoEligibility: "nigeria_eligible",
          remoteScope: "global",
          location: "Worldwide",
          postedAt: "2026-07-19T00:00:00.000Z",
        }),
        "reactFrontend",
        referenceDate,
      ),
    };
    expect(compareRankedJobs(high, low)).toBeLessThan(0);
    expect(compareRankedJobs(low, high)).toBeGreaterThan(0);
  });
});

describe("hard filter independence", () => {
  it("does not use scores as eligibility gates", () => {
    const reactPolicy = loadAndCompileScanPolicy({ configPath: paths.jobSearchConfig });
    const backendPolicy = loadAndCompileScanPolicy({
      configPath: paths.jobSearchConfig,
      profileOverride: "nodejsBackend",
    });

    const lowScoreEligible = makePosting({
      title: "Software Engineer",
      description: "We use React and Next.js for our frontend platform worldwide.",
      location: "Worldwide",
      remoteScope: "global",
      level: "senior",
      postedAt: "2026-01-01T00:00:00.000Z",
    });
    const excluded = makePosting({
      title: "Senior Python Engineer",
      description: "Django backend only.",
      location: "Worldwide",
      remoteScope: "global",
      level: "senior",
    });

    const reactMatched = filterPostings([lowScoreEligible, excluded], reactPolicy).matched;
    expect(reactMatched).toHaveLength(1);
    expect(reactMatched[0]?.title).toContain("Software Engineer");

    const score = scoreJobPosting(lowScoreEligible, "reactFrontend");
    expect(score.total).toBeLessThan(0.8);

    const backendMatched = filterPostings([lowScoreEligible], backendPolicy).matched;
    expect(backendMatched).toHaveLength(0);
  });
});

describe("computeEffectivenessMetrics", () => {
  it("computes per-source yield and dismissal proxy from fixture counts", () => {
    const posting = makePosting({
      title: "Senior React Engineer",
      description: "React worldwide.",
      location: "Worldwide",
      remoteScope: "global",
      geoEligibility: "nigeria_eligible",
      postedAt: "2026-07-19T00:00:00.000Z",
    });
    const dismissed = makePosting({
      company: "Dismissed Co",
      title: "Senior React Engineer",
      description: "React.",
      location: "Worldwide",
      remoteScope: "global",
      geoEligibility: "nigeria_eligible",
      url: "https://example.com/jobs/2",
    });

    const metrics = computeEffectivenessMetrics({
      policyMatched: [posting, dismissed],
      newJobs: [posting],
      previouslySeen: [],
      lifecycleSuppressed: { applied: 0, dismissed: 1, expired: 0 },
      lifecycleState: {
        version: 2,
        applied: {},
        dismissed: {
          [dismissed.dedupeKey]: {
            dedupeKey: dismissed.dedupeKey,
            company: dismissed.company,
            title: dismissed.title,
            url: dismissed.url,
            dismissedAt: "2026-07-01T00:00:00.000Z",
          },
        },
        expired: {},
      },
      sourceStats: [
        {
          sourceId: "jobicy",
          adapter: "jobicy",
          status: "success",
          fetched: 20,
          normalized: 20,
          quarantined: 0,
          matched: 2,
          durationMs: 100,
          requestUrls: [],
          failed: false,
        },
      ],
      roleProfile: "reactFrontend",
      referenceDate: new Date("2026-07-20T12:00:00.000Z"),
    });

    expect(metrics.sourceYield).toHaveLength(1);
    expect(metrics.sourceYield[0]?.fetched).toBe(20);
    expect(metrics.sourceYield[0]?.matched).toBe(2);
    expect(metrics.sourceYield[0]?.new).toBe(1);
    expect(metrics.sourceYield[0]?.suppressed.dismissed).toBe(1);
    expect(metrics.sourceYield[0]?.yieldRate).toBe(0.1);
    expect(metrics.falsePositiveProxy).toBe(0.5);
    expect(metrics.lifecycleSuppressed.dismissed).toBe(1);
  });
});
