import { describe, expect, it } from "vitest";
import { validateRemoteOkJob, remoteOkJobToPosting } from "../../src/lib/jobs/boards/remoteok.ts";
import { parseHnHiringComment } from "../../src/lib/jobs/boards/hn-hiring.ts";
import { parseWwrRss } from "../../src/lib/jobs/boards/wwr.ts";
import {
  canonicalizeUrl,
  isBlocklisted,
  isKnownInState,
  makeDedupeKeyFromPosting,
  makeLegacyDedupeKey,
} from "../../src/lib/jobs/dedupe.ts";
import { filterPostings } from "../../src/lib/jobs/filter.ts";
import { decodeHtmlEntities, normalizeRawPosting } from "../../src/lib/jobs/normalize.ts";
import { renderScanReport } from "../../src/lib/jobs/report.ts";
import { loadAndCompileScanPolicy, serializeScanPolicy } from "../../src/lib/jobs/scan-policy.ts";
import type { JobPosting } from "../../src/lib/jobs/types.ts";
import { paths } from "../../src/lib/paths.ts";
import { partitionScanResults } from "../../src/lib/jobs/pipeline.ts";
import { makeScanRunResult } from "./helpers/scan-result-fixture.js";

describe("dedupe", () => {
  it("prefers canonical URL keys and strips utm tracking params", () => {
    const key = makeDedupeKeyFromPosting({
      sourceId: "jobicy",
      sourceJobId: "123",
      company: "Acme",
      title: "React Engineer",
      url: "https://jobicy.com/jobs/123?utm_source=newsletter",
    });
    expect(key).toBe("url::https://jobicy.com/jobs/123");
  });

  it("matches legacy keys in state", () => {
    const posting = {
      dedupeKey: "url::https://example.com/jobs/1",
      legacyDedupeKey: makeLegacyDedupeKey("Acme", "React Engineer"),
    };
    expect(isKnownInState(posting, { [posting.legacyDedupeKey]: {} })).toBe(true);
  });

  it("canonicalizes URLs consistently", () => {
    expect(canonicalizeUrl("https://Example.com/jobs/1/")).toBe("https://example.com/jobs/1");
  });
});

describe("blocklist", () => {
  it("blocks Metabase and Canonical", () => {
    const blocklist = ["Metabase", "Canonical", "Micro1"];
    expect(isBlocklisted("Metabase", blocklist)).toBe(true);
    expect(isBlocklisted("Canonical", blocklist)).toBe(true);
    expect(isBlocklisted("Hostaway", blocklist)).toBe(false);
  });
});

describe("normalize", () => {
  it("decodes HTML entities and strips tags", () => {
    expect(decodeHtmlEntities("React &amp; Next.js")).toBe("React & Next.js");
    const posting = normalizeRawPosting(
      {
        sourceId: "jobicy",
        sourceJobId: "1",
        company: "Acme",
        title: "Frontend Engineer",
        url: "https://example.com/apply",
        location: "Worldwide",
        description: "<p>React role</p>",
      },
      "2026-07-18T00:00:00.000Z",
    );
    expect(posting.description).toContain("React role");
    expect(posting.legacyDedupeKey).toBe(makeLegacyDedupeKey("Acme", "Frontend Engineer"));
  });
});

describe("remoteok validation", () => {
  it("rejects known spam descriptions", () => {
    expect(
      validateRemoteOkJob({
        company: "Example Co",
        position: "Adelaide",
        description: "There are no articles in this category.",
        location: "Adelaide",
        url: "https://remoteok.com/remote-jobs/1",
      }).ok,
    ).toBe(false);
  });

  it("accepts plausible backend roles without adapter-side role filtering", () => {
    const validation = validateRemoteOkJob({
      company: "Example Co",
      position: "Senior Node.js Backend Engineer",
      description:
        "Build Node.js APIs for a remote team worldwide. Strong Express and PostgreSQL required.",
      location: "Remote",
      url: "https://remoteok.com/remote-jobs/2",
      epoch: Math.floor(Date.now() / 1000),
    });
    expect(validation.ok).toBe(true);
    const posting = remoteOkJobToPosting({
      id: "2",
      company: "Example Co",
      position: "Senior React Frontend Engineer",
      description: "Build React apps for a remote team worldwide.",
      location: "Remote",
      url: "https://remoteok.com/remote-jobs/2",
    });
    expect(posting.title).toContain("React");
  });
});

describe("hn hiring parser", () => {
  it("extracts pipe-delimited hiring comments", () => {
    const parsed = parseHnHiringComment(
      {
        id: 123,
        author: "startupco",
        text: "StartupCo | Senior React Engineer | REMOTE | https://startupco.com/jobs/react",
      },
      "999",
    );
    expect(parsed.posting?.company).toBe("StartupCo");
    expect(parsed.posting?.title).toContain("React");
  });

  it("keeps non-frontend comments for shared filtering", () => {
    const parsed = parseHnHiringComment(
      {
        id: 124,
        author: "startupco",
        text: "We are hiring a sales manager in NYC with a long enough description to pass parsing.",
      },
      "999",
    );
    expect(parsed.posting?.title).toContain("sales manager");
  });
});

describe("wwr rss parser", () => {
  it("parses item blocks from RSS", () => {
    const items = parseWwrRss(`<?xml version="1.0"?><rss><channel><item>
      <title>Acme: Frontend Engineer</title>
      <link>https://weworkremotely.com/remote-jobs/1</link>
      <region>Anywhere in the World</region>
      <description>&lt;p&gt;React role&lt;/p&gt;</description>
    </item></channel></rss>`);
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain("Frontend Engineer");
  });
});

describe("report", () => {
  it("includes all matched listings in markdown tables", () => {
    const policy = loadAndCompileScanPolicy({ configPath: paths.jobSearchConfig });
    const posting = normalizeRawPosting(
      {
        sourceId: "jobicy",
        sourceJobId: "1",
        company: "Acme",
        title: "Senior Frontend Engineer",
        url: "https://example.com/jobs/1",
        location: "Worldwide",
        description: "React, TypeScript, remote worldwide.",
      },
      "2026-07-18T00:00:00.000Z",
    );
    posting.geoEligibility = "nigeria_eligible";

    const result = makeScanRunResult({
      policy: serializeScanPolicy(policy),
      allMatched: [posting],
      previouslySeen: [posting],
      policyMatched: 1,
    });

    const markdown = renderScanReport(result);
    expect(markdown).toContain("All matched — Nigeria-eligible");
    expect(markdown).toContain("Senior Frontend Engineer");
    expect(markdown).toContain("| Seen |");
    expect(markdown).toContain("this Markdown file");
    expect(markdown).toContain("Effective scan policy");
  });
});

describe("partitionScanResults", () => {
  it("isolates seen state by role profile", () => {
    const posting = normalizeRawPosting(
      {
        sourceId: "jobicy",
        sourceJobId: "1",
        company: "Acme",
        title: "Senior Frontend Engineer",
        url: "https://example.com/jobs/1",
        location: "Worldwide",
        description: "React role",
      },
      "2026-07-18T00:00:00.000Z",
    );

    const seenOnlyInReact = {
      version: 3 as const,
      profiles: {
        reactFrontend: {
          [posting.dedupeKey]: {
            dedupeKey: posting.dedupeKey,
            company: posting.company,
            title: posting.title,
            url: posting.url,
            firstSeenAt: "2026-07-01T00:00:00.000Z",
            lastSeenAt: "2026-07-01T00:00:00.000Z",
          },
        },
        nodejsBackend: {},
      },
    };

    const reactResult = partitionScanResults(
      [posting],
      seenOnlyInReact,
      { version: 2, applied: {}, dismissed: {}, expired: {} },
      "reactFrontend",
    );
    const backendResult = partitionScanResults(
      [posting],
      seenOnlyInReact,
      { version: 2, applied: {}, dismissed: {}, expired: {} },
      "nodejsBackend",
    );

    expect(reactResult.previouslySeen).toHaveLength(1);
    expect(backendResult.newJobs).toHaveLength(1);
  });
});

describe("filter", () => {
  it("matches react frontend roles", () => {
    const policy = loadAndCompileScanPolicy({ configPath: paths.jobSearchConfig });
    const base: JobPosting = normalizeRawPosting(
      {
        sourceId: "remotive",
        sourceJobId: "1",
        company: "Acme",
        title: "Senior Frontend Engineer",
        url: "https://example.com/jobs/1",
        location: "Worldwide",
        description: "React, TypeScript, remote worldwide.",
      },
      "2026-07-18T00:00:00.000Z",
    );

    const { matched } = filterPostings([base], policy);
    expect(matched.length).toBe(1);
  });
});
