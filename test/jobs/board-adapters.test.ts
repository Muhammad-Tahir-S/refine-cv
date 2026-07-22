import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildArbeitnowRequestUrl,
  parseArbeitnowResponse,
} from "../../src/lib/jobs/boards/arbeitnow.ts";
import {
  buildHimalayasRequestUrl,
  parseHimalayasResponse,
} from "../../src/lib/jobs/boards/himalayas.ts";
import {
  fetchHnHiringRaw,
  parseHnHiringComment,
  parseHnHiringComments,
} from "../../src/lib/jobs/boards/hn-hiring.ts";
import {
  buildJobicyRequestUrl,
  parseJobicyResponse,
} from "../../src/lib/jobs/boards/jobicy.ts";
import {
  buildRemotiveRequestUrl,
  parseRemotiveResponse,
} from "../../src/lib/jobs/boards/remotive.ts";
import {
  buildRemoteOkRequestUrl,
  isRemoteOkMetadataRecord,
  parseRemoteOkResponse,
  remoteOkJobToPosting,
  validateRemoteOkJob,
} from "../../src/lib/jobs/boards/remoteok.ts";
import {
  buildWwrFeedUrl,
  parseWwrItems,
  parseWwrRss,
} from "../../src/lib/jobs/boards/wwr.ts";
import { filterPostings } from "../../src/lib/jobs/filter.ts";
import { normalizeRawPosting } from "../../src/lib/jobs/normalize.ts";
import { loadAndCompileScanPolicy } from "../../src/lib/jobs/scan-policy.ts";
import {
  resolveEffectiveSourceOptions,
  validateJobSourceEntry,
} from "../../src/lib/jobs/sources/source-options.ts";
import {
  JobSourceEntrySchema,
  JobSourcesConfigSchema,
  loadJobSourcesConfig,
  parseJobSourcesConfig,
} from "../../src/lib/jobs/sources/registry.ts";
import { fixturePaths } from "./helpers/fixture-paths.ts";

const fixturesDir = join(import.meta.dirname, "fixtures");

function readFixture<T>(name: string): T {
  const raw = readFileSync(join(fixturesDir, name), "utf8");
  return JSON.parse(raw) as T;
}

describe("board adapter fixtures", () => {
  it("Remote OK skips metadata and parses valid jobs", () => {
    const payload = readFixture<unknown[]>("remoteok-mixed.json");
    const metadata = payload[0] as Record<string, unknown>;
    expect(isRemoteOkMetadataRecord(metadata)).toBe(true);

    const result = parseRemoteOkResponse(payload as never, "Remote OK attribution");
    expect(result.postings).toHaveLength(1);
    expect(result.quarantined).toBe(1);
    expect(result.quarantineDiagnostics.byReason["known spam description"]).toBe(1);
    expect(result.quarantineDiagnostics.samples[0]?.title).toBe("Adelaide");

    const posting = result.postings[0];
    expect(posting.sourceJobId).toBe("101");
    expect(posting.url).toBe("https://acme.example/jobs/react");
    expect(posting.listingUrl).toBe("https://remoteok.com/remote-jobs/101");
    expect(posting.location).toBe("Remote");
    expect(posting.description).toContain("React");
    expect(posting.attribution).toBe("Remote OK attribution");
  });

  it("Remote OK accepts jobs with last_updated when identity fields exist", () => {
    expect(
      validateRemoteOkJob({
        id: "55",
        company: "Acme",
        position: "Backend Engineer Node.js",
        description:
          "Build Node.js APIs for a remote team worldwide with Express and PostgreSQL in production.",
        location: "Remote",
        url: "https://remoteok.com/remote-jobs/55",
        last_updated: 1720000100,
      }).ok,
    ).toBe(true);
  });

  it("Remote OK encodes tags as one comma-separated parameter", () => {
    expect(buildRemoteOkRequestUrl({ tags: "nodejs, backend, dev" })).toBe(
      "https://remoteok.com/api?tags=nodejs,backend,dev",
    );
  });

  it.each([
    { description: "" },
    { description: "Short." },
    { description: undefined, epoch: 1 },
  ])("Remote OK accepts optional or short descriptions: $description", (fields) => {
    expect(
      validateRemoteOkJob({
        id: "short-description",
        company: "Acme",
        position: "Node.js Engineer",
        url: "https://remoteok.com/remote-jobs/short-description",
        ...fields,
      }).ok,
    ).toBe(true);
  });

  it("Himalayas maps valid jobs and quarantines malformed records", () => {
    const response = readFixture("himalayas-valid.json");
    const result = parseHimalayasResponse(response as never, "Himalayas attribution");
    expect(result.postings).toHaveLength(1);
    expect(result.quarantined).toBe(1);
    expect(result.postings[0].sourceJobId).toBe("himalayas-1");
    expect(result.postings[0].location).toBe("Worldwide");
    expect(result.postings[0].postedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("Himalayas encodes search query parameters", () => {
    expect(buildHimalayasRequestUrl({ query: "node backend", worldwide: true }, 0)).toContain(
      "q=node%20backend",
    );
  });

  it("Jobicy maps valid jobs and quarantines malformed records", () => {
    const response = readFixture("jobicy-valid.json");
    const result = parseJobicyResponse(response as never, "Jobicy attribution");
    expect(result.postings).toHaveLength(1);
    expect(result.quarantined).toBe(1);
    expect(result.postings[0].sourceJobId).toBe("501");
    expect(result.postings[0].url).toBe("https://jobicy.com/jobs/501");
    expect(buildJobicyRequestUrl({ tag: "backend", count: 50 })).toBe(
      "https://jobicy.com/api/v2/remote-jobs?count=50&tag=backend",
    );
  });

  it("Remotive maps valid jobs and quarantines malformed records", () => {
    const response = readFixture("remotive-valid.json");
    const result = parseRemotiveResponse(response as never, "Remotive attribution");
    expect(result.postings).toHaveLength(1);
    expect(result.quarantined).toBe(1);
    expect(result.postings[0].title).toContain("Node.js");
    expect(buildRemotiveRequestUrl({ search: "node", category: "software-dev" })).toBe(
      "https://remotive.com/api/remote-jobs?search=node&category=software-dev&limit=100",
    );
  });

  it("Arbeitnow maps valid jobs and quarantines malformed records", () => {
    const response = readFixture("arbeitnow-valid.json");
    const result = parseArbeitnowResponse(response as never, "Arbeitnow attribution");
    expect(result.postings).toHaveLength(1);
    expect(result.quarantined).toBe(1);
    expect(result.postings[0].sourceJobId).toBe("backend-engineer-acme");
    expect(result.postings[0].postedAt).toBe(new Date(1720000000 * 1000).toISOString());
    expect(buildArbeitnowRequestUrl(2)).toBe(
      "https://www.arbeitnow.com/api/job-board-api?page=2",
    );
  });

  it("WWR parses RSS items and quarantines empty entries", () => {
    const xml = readFileSync(join(fixturesDir, "wwr-valid.xml"), "utf8");
    const items = parseWwrRss(xml);
    const result = parseWwrItems(items, "WWR attribution");
    expect(result.postings).toHaveLength(1);
    expect(result.quarantined).toBe(1);
    expect(result.postings[0].title).toContain("Node.js");
    expect(result.postings[0].listingUrl).toBe("https://weworkremotely.com/remote-jobs/9001");
  });

  it("WWR maps its supported backend feed URL", () => {
    expect(buildWwrFeedUrl("back-end")).toBe(
      "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
    );
  });

  it("HN hiring parses backend comments without adapter-side role filtering", () => {
    const item = readFixture("hn-hiring-valid.json") as { children: unknown };
    const result = parseHnHiringComments(
      item.children as never,
      "999",
      "2026-07-01T00:00:00.000Z",
      "HN attribution",
    );
    expect(result.postings).toHaveLength(2);
    expect(result.quarantined).toBe(1);
    expect(result.postings.some((posting) => posting.title.includes("Node.js"))).toBe(true);
    expect(result.postings.some((posting) => posting.title.includes("sales manager"))).toBe(true);

    const backendPolicy = loadAndCompileScanPolicy({
      configPath: fixturePaths.jobSearchNodejsBackend,
    });
    const backendMatches = filterPostings(
      result.postings.map((posting) =>
        normalizeRawPosting(posting, {
          configuredSourceId: "hn-hiring",
          adapterId: "hn-hiring",
          fetchedAt: "2026-07-20T00:00:00.000Z",
        }),
      ),
      backendPolicy,
    );
    expect(backendMatches.matched.some((posting) => posting.title.includes("Node.js"))).toBe(true);
    expect(backendMatches.excluded.some((entry) => entry.posting.title.includes("sales manager"))).toBe(
      true,
    );
  });

  it("HN comment parser extracts pipe-delimited titles", () => {
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

  it("HN fetch parses only top-level listing comments", async () => {
    const item = readFixture<Record<string, unknown>>("hn-hiring-valid.json");
    const result = await fetchHnHiringRaw(
      { attribution: "HN attribution" },
      {
        findThread: async () => ({
          objectID: "999",
          title: "Ask HN: Who is hiring? (July 2026)",
          created_at: "2026-07-01T00:00:00.000Z",
        }),
        fetchItem: async <T>() => item as T,
      },
    );

    expect(result.postings.map((posting) => posting.sourceJobId)).not.toContain("999-1101");
    expect(result.postings.some((posting) => posting.title.includes("Node.js"))).toBe(true);
  });

  const malformedRows: unknown[] = [null, 42, "not-a-record", []];
  const recordIsolationCases: Array<{
    name: string;
    valid: () => unknown;
    parse: (rows: unknown[]) => {
      postings: unknown[];
      quarantined: number;
      quarantineDiagnostics: { byCategory: Record<string, number> };
    };
  }> = [
    {
      name: "Himalayas",
      valid: () =>
        (readFixture<{ jobs: unknown[] }>("himalayas-valid.json").jobs)[0],
      parse: (rows) => parseHimalayasResponse({ jobs: rows }),
    },
    {
      name: "Jobicy",
      valid: () => (readFixture<{ jobs: unknown[] }>("jobicy-valid.json").jobs)[0],
      parse: (rows) => parseJobicyResponse({ jobs: rows }),
    },
    {
      name: "Remotive",
      valid: () => (readFixture<{ jobs: unknown[] }>("remotive-valid.json").jobs)[0],
      parse: (rows) => parseRemotiveResponse({ jobs: rows }),
    },
    {
      name: "Arbeitnow",
      valid: () => (readFixture<{ data: unknown[] }>("arbeitnow-valid.json").data)[0],
      parse: (rows) => parseArbeitnowResponse({ data: rows }),
    },
    {
      name: "Remote OK",
      valid: () => (readFixture<unknown[]>("remoteok-mixed.json"))[1],
      parse: (rows) => parseRemoteOkResponse(rows),
    },
    {
      name: "WWR",
      valid: () => {
        const xml = readFileSync(join(fixturesDir, "wwr-valid.xml"), "utf8");
        return parseWwrRss(xml)[0];
      },
      parse: (rows) => parseWwrItems(rows),
    },
    {
      name: "HN Hiring",
      valid: () =>
        (readFixture<{ children: unknown[] }>("hn-hiring-valid.json").children)[0],
      parse: (rows) => parseHnHiringComments(rows, "999"),
    },
  ];

  it.each(recordIsolationCases)(
    "$name quarantines unknown rows without losing valid siblings",
    ({ valid, parse }) => {
      const result = parse([valid(), ...malformedRows]);
      expect(result.postings).toHaveLength(1);
      expect(result.quarantined).toBe(malformedRows.length);
      expect(result.quarantineDiagnostics.byCategory.malformed).toBe(
        malformedRows.length,
      );
    },
  );

  it.each([
    ["Himalayas", () => parseHimalayasResponse({ jobs: null })],
    ["Jobicy", () => parseJobicyResponse([])],
    ["Remotive", () => parseRemotiveResponse({ jobs: {} })],
    ["Arbeitnow", () => parseArbeitnowResponse({})],
    ["Remote OK", () => parseRemoteOkResponse({})],
    ["WWR", () => parseWwrRss("not rss")],
    ["HN Hiring", () => parseHnHiringComments({}, "999")],
  ])("%s rejects an invalid top-level container", (_name, parse) => {
    expect(parse).toThrow();
  });

  it("HN fetch rejects an invalid item top-level shape", async () => {
    await expect(
      fetchHnHiringRaw(
        {},
        {
          findThread: async () => ({
            objectID: "999",
            title: "Ask HN: Who is hiring? (July 2026)",
          }),
          fetchItem: async <T>() => ({ id: 999, title: "Who is hiring?" }) as T,
        },
      ),
    ).rejects.toThrow(/children.*array/);
  });
});

describe("profile-aware source options", () => {
  it("resolves different effective requests for React vs Node profiles", () => {
    const config = loadJobSourcesConfig();
    const remotive = config.sources.find((source) => source.id === "remotive");
    const remoteok = config.sources.find((source) => source.id === "remoteok");
    const wwr = config.sources.find((source) => source.id === "wwr");

    expect(resolveEffectiveSourceOptions(remotive!, "reactFrontend").search).toBe("frontend");
    expect(resolveEffectiveSourceOptions(remotive!, "nodejsBackend").search).toBe("node");
    expect(buildRemotiveRequestUrl(resolveEffectiveSourceOptions(remotive!, "nodejsBackend"))).toContain(
      "search=node",
    );

    expect(resolveEffectiveSourceOptions(remoteok!, "reactFrontend").tags).toBe("frontend,react,dev");
    expect(resolveEffectiveSourceOptions(remoteok!, "nodejsBackend").tags).toBe(
      "nodejs,backend,dev",
    );

    expect(resolveEffectiveSourceOptions(wwr!, "reactFrontend").feeds).toContain("front-end");
    expect(resolveEffectiveSourceOptions(wwr!, "nodejsBackend").feeds).not.toContain("front-end");
    expect(resolveEffectiveSourceOptions(wwr!, "nodejsBackend").feeds).toContain("back-end");
  });

  it("rejects unsupported adapter options at config validation time", () => {
    expect(() =>
      validateJobSourceEntry({
        id: "bad-hn",
        adapter: "hn-hiring",
        enabled: true,
        query: "should-not-exist",
      }),
    ).toThrow(/unsupported option "query"/);
  });

  it("keeps backward compatibility for top-level query fields", () => {
    const legacy = {
      id: "himalayas",
      adapter: "himalayas" as const,
      enabled: true,
      query: "legacy query",
    };
    expect(resolveEffectiveSourceOptions(legacy, "nodejsBackend").query).toBe("legacy query");
  });

  it("rejects unknown top-level config and source fields", () => {
    expect(() =>
      JobSourcesConfigSchema.parse({ version: 1, sources: [], unexpected: true }),
    ).toThrow();
    expect(() =>
      JobSourceEntrySchema.parse({
        id: "hn",
        adapter: "hn-hiring",
        enabled: true,
        unexpected: true,
      }),
    ).toThrow();
  });

  it.each([
    { minPollHours: -1 },
    { minPollHours: 1.5 },
    { maxPages: 0 },
    { maxPages: 11 },
    { maxPages: 1.5 },
    { count: 0 },
    { count: 201 },
    { count: 1.5 },
  ])("rejects invalid legacy numeric options: $minPollHours $maxPages $count", (option) => {
    expect(() =>
      JobSourceEntrySchema.parse({
        id: "jobicy",
        adapter: "jobicy",
        enabled: true,
        ...option,
      }),
    ).toThrow();
  });

  it("rejects invalid profile numeric options", () => {
    expect(() =>
      JobSourceEntrySchema.parse({
        id: "jobicy",
        adapter: "jobicy",
        enabled: true,
        profileOptions: {
          reactFrontend: { tag: "react", count: 201 },
          nodejsBackend: { tag: "backend", count: 100 },
        },
      }),
    ).toThrow();
  });

  it("rejects duplicate source IDs", () => {
    expect(() =>
      parseJobSourcesConfig({
        version: 1,
        sources: [
          { id: "duplicate", adapter: "hn-hiring", enabled: true },
          { id: "duplicate", adapter: "hn-hiring", enabled: false },
        ],
      }),
    ).toThrow(/Duplicate configured source id/);
  });

  it("requires both profile option sets when profile options are used", () => {
    expect(() =>
      JobSourceEntrySchema.parse({
        id: "himalayas",
        adapter: "himalayas",
        enabled: true,
        query: "react frontend",
        profileOptions: {
          reactFrontend: { query: "react frontend" },
        },
      }),
    ).toThrow(/reactFrontend and nodejsBackend/);
  });
});

describe("remoteok mapping helper", () => {
  it("maps posting fields from a valid job record", () => {
    const posting = remoteOkJobToPosting({
      id: "2",
      company: "Example Co",
      position: "Senior React Frontend Engineer",
      description: "Build React apps for a remote team worldwide.",
      location: "Remote",
      url: "https://remoteok.com/remote-jobs/2",
      date: "2026-07-01",
    });
    expect(posting.title).toContain("React");
    expect(posting.postedAt).toBe("2026-07-01");
  });
});
