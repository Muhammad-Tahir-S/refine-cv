import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { paths } from "../../src/lib/paths.ts";
import { classifyGeoEligibility } from "../../src/lib/jobs/geo.ts";
import { filterPostings, matchesScanCriteria } from "../../src/lib/jobs/filter.ts";
import { matchesRoleProfile } from "../../src/lib/jobs/role-match.ts";
import { renderScanReport } from "../../src/lib/jobs/report.ts";
import { normalizeRawPosting } from "../../src/lib/jobs/normalize.ts";
import {
  compileScanPolicy,
  JobSearchConfigSchema,
  loadAndCompileScanPolicy,
  loadJobSearchConfigAt,
  parseProfileOverride,
  resolveScanConfigPath,
  serializeScanPolicy,
} from "../../src/lib/jobs/scan-policy.ts";
import type { JobPosting, ScanRunResult } from "../../src/lib/jobs/types.ts";

const defaultGeoPolicy = {
  acceptGlobalRemote: true,
  acceptEmeaOnlyWhenAfricaMentioned: true,
  defaultEmeaToVerify: true,
  summary: "test",
};

function makePosting(overrides: Partial<JobPosting> & Pick<JobPosting, "title" | "description">): JobPosting {
  return normalizeRawPosting(
    {
      sourceId: "remotive",
      sourceJobId: "1",
      company: "Acme",
      title: overrides.title,
      url: "https://example.com/jobs/1",
      location: overrides.location ?? "Worldwide",
      description: overrides.description,
    },
    "2026-07-18T00:00:00.000Z",
  );
}

describe("scan policy compilation", () => {
  it("loads default react config with legacy reactFrontend flag", () => {
    const config = loadJobSearchConfigAt(paths.jobSearchConfig);
    const policy = compileScanPolicy(config, { configPath: paths.jobSearchConfig });

    expect(policy.roleProfile).toBe("reactFrontend");
    expect(policy.allowedLevels).toContain("senior");
    expect(policy.configLabel).toBe("config/job-search.json");
  });

  it("loads explicit nodejs backend config", () => {
    const backendConfigPath = join(paths.root, "config", "job-search-nodejs-backend.json");
    const policy = loadAndCompileScanPolicy({ configPath: backendConfigPath });

    expect(policy.roleProfile).toBe("nodejsBackend");
    expect(policy.allowedLevels).toEqual(["junior", "mid", "unknown"]);
    expect(policy.applicant.citizenship).toBe("Nigeria");
    expect(policy.blocklist).toContain("EPAM");
  });

  it("applies profile override over config file", () => {
    const policy = loadAndCompileScanPolicy({
      configPath: paths.jobSearchConfig,
      profileOverride: "nodejsBackend",
    });
    expect(policy.roleProfile).toBe("nodejsBackend");
  });

  it("resolves relative config paths from cwd", () => {
    expect(resolveScanConfigPath("config/job-search.json")).toBe(
      join(process.cwd(), "config", "job-search.json"),
    );
  });

  it("rejects invalid profile overrides", () => {
    expect(() => parseProfileOverride("fullstack")).toThrow(/Invalid role profile/);
  });

  it("rejects an empty allowed-level policy", () => {
    const config = loadJobSearchConfigAt(paths.jobSearchConfig);
    expect(() =>
      JobSearchConfigSchema.parse({
        ...config,
        roleFilters: {
          ...config.roleFilters,
          levels: [],
        },
      }),
    ).toThrow();
  });

  it("omits absolute config paths from serialized policy", () => {
    const policy = loadAndCompileScanPolicy({
      configPath: join(paths.root, "config", "job-search-nodejs-backend.json"),
    });
    const serialized = serializeScanPolicy(policy);

    expect(serialized).not.toHaveProperty("configPath");
    expect(JSON.stringify(serialized)).not.toContain(paths.root);
    expect(serialized.configLabel).toBe(
      "config/job-search-nodejs-backend.json",
    );
  });
});

describe("role matching", () => {
  it("matches react frontend roles", () => {
    expect(
      matchesRoleProfile(
        "Senior Frontend Engineer",
        "React, TypeScript, remote worldwide.",
        "reactFrontend",
      ),
    ).toBe(true);
    expect(
      matchesRoleProfile(
        "Backend Engineer",
        "Node.js API development.",
        "reactFrontend",
      ),
    ).toBe(false);
  });

  it("matches nodejs backend roles conservatively", () => {
    expect(
      matchesRoleProfile(
        "Senior Node.js Backend Engineer",
        "NestJS and Express APIs.",
        "nodejsBackend",
      ),
    ).toBe(true);
    expect(
      matchesRoleProfile(
        "Python Engineer",
        "Django backend services.",
        "nodejsBackend",
      ),
    ).toBe(false);
    expect(
      matchesRoleProfile(
        "Frontend Engineer (React)",
        "React UI work only.",
        "nodejsBackend",
      ),
    ).toBe(false);
    expect(
      matchesRoleProfile(
        "Software Engineer",
        "Strong Node.js and Express experience required.",
        "nodejsBackend",
      ),
    ).toBe(true);
  });

  it("requires Node signals for generic backend titles", () => {
    expect(
      matchesRoleProfile(
        "Backend Engineer",
        "Build Python and Django services backed by PostgreSQL.",
        "nodejsBackend",
      ),
    ).toBe(false);
    expect(
      matchesRoleProfile(
        "Backend Engineer",
        "Build Node.js APIs with Express and PostgreSQL.",
        "nodejsBackend",
      ),
    ).toBe(true);
  });

  it.each([
    "Build Go services with Gin.",
    "Build Java services with Spring Boot.",
    "Build Ruby services with Rails.",
    "Build PHP services with Laravel.",
  ])("rejects generic backend titles for unrelated stacks: %s", (description) => {
    expect(
      matchesRoleProfile("Backend Engineer", description, "nodejsBackend"),
    ).toBe(false);
  });

  it("matches explicit Node framework titles directly", () => {
    expect(
      matchesRoleProfile(
        "NestJS Engineer",
        "Build and operate production services.",
        "nodejsBackend",
      ),
    ).toBe(true);
    expect(
      matchesRoleProfile(
        "Express API Developer",
        "Build and operate production services.",
        "nodejsBackend",
      ),
    ).toBe(true);
  });
});

describe("level exclusions", () => {
  it("excludes senior roles for backend policy", () => {
    const policy = loadAndCompileScanPolicy({
      configPath: join(paths.root, "config", "job-search-nodejs-backend.json"),
    });
    const posting = makePosting({
      title: "Senior Node.js Backend Engineer",
      description: "Node.js, NestJS, Express. Remote worldwide.",
    });

    const result = matchesScanCriteria(posting, policy);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Level not allowed: senior");
  });

  it("allows senior roles for react policy", () => {
    const policy = loadAndCompileScanPolicy({ configPath: paths.jobSearchConfig });
    const posting = makePosting({
      title: "Senior Frontend Engineer",
      description: "React, TypeScript, remote worldwide.",
    });

    const { matched } = filterPostings([posting], policy);
    expect(matched).toHaveLength(1);
  });
});

describe("geo policy booleans", () => {
  it("accepts global remote when enabled", () => {
    expect(
      classifyGeoEligibility(
        {
          location: "Remote",
          description: "Remote role.",
          remoteScope: "global",
        },
        defaultGeoPolicy,
      ),
    ).toBe("nigeria_eligible");
  });

  it("verifies global remote when acceptGlobalRemote is false", () => {
    expect(
      classifyGeoEligibility(
        {
          location: "Remote",
          description: "Remote role.",
          remoteScope: "global",
        },
        { ...defaultGeoPolicy, acceptGlobalRemote: false },
      ),
    ).toBe("verify_geo");
  });

  it("verifies EMEA-only without Africa when defaultEmeaToVerify is true", () => {
    expect(
      classifyGeoEligibility(
        {
          location: "Home Based - EMEA",
          description: "Remote-first team across Europe.",
          remoteScope: "emea",
        },
        defaultGeoPolicy,
      ),
    ).toBe("verify_geo");
  });

  it("excludes EMEA-only without Africa when defaultEmeaToVerify is false", () => {
    expect(
      classifyGeoEligibility(
        {
          location: "Home Based - EMEA",
          description: "Remote-first team across Europe.",
          remoteScope: "emea",
        },
        {
          ...defaultGeoPolicy,
          defaultEmeaToVerify: false,
        },
      ),
    ).toBe("likely_excluded");
  });

  it("skips EMEA-only Africa requirement when acceptEmeaOnlyWhenAfricaMentioned is false", () => {
    expect(
      classifyGeoEligibility(
        {
          location: "Home Based - EMEA",
          description: "Remote-first team across Europe.",
          remoteScope: "emea",
        },
        {
          ...defaultGeoPolicy,
          acceptEmeaOnlyWhenAfricaMentioned: false,
          defaultEmeaToVerify: false,
        },
      ),
    ).toBe("nigeria_eligible");
  });

  it("still excludes explicit geo restrictions", () => {
    expect(
      classifyGeoEligibility(
        {
          location: "Remote",
          description: "EU only. Must be based in Germany.",
          remoteScope: "global",
        },
        defaultGeoPolicy,
      ),
    ).toBe("likely_excluded");
  });
});

describe("report policy agreement", () => {
  it("serializes the effective policy used for filtering", () => {
    const policy = loadAndCompileScanPolicy({
      configPath: join(paths.root, "config", "job-search-nodejs-backend.json"),
    });
    const posting = makePosting({
      title: "Mid Node.js Backend Engineer",
      description: "Node.js APIs. Remote worldwide.",
    });
    posting.geoEligibility = "nigeria_eligible";

    const serialized = serializeScanPolicy(policy);
    const result: ScanRunResult = {
      scanDate: "20 July 2026",
      outputDir: "/tmp/job-scan",
      runId: "20260718T120000Z-react-frontend-abc123",
      policy: serialized,
      allMatched: [posting],
      newJobs: [posting],
      previouslySeen: [],
      lifecycleSuppressed: { applied: 0, dismissed: 0, expired: 0 },
      excluded: [],
      blocklistExcluded: 0,
      fetchErrors: [],
      sourceStats: [],
      outcome: {
        attemptedSources: 0,
        skippedSources: 0,
        succeededSources: 0,
        failedSources: 0,
        allSkippedDueToCadence: false,
        totalSourceOutage: false,
      },
      hadSuccessfulSourceFetch: true,
    };

    const markdown = renderScanReport(result);
    expect(markdown).toContain("Effective scan policy");
    expect(markdown).toContain('"roleProfile": "nodejsBackend"');
    expect(markdown).toContain('"allowedLevels"');
    expect(markdown).toContain("Node.js / backend focus");
    expect(markdown).not.toContain("React / frontend focus");
    expect(markdown).not.toContain(paths.root);
  });
});

describe("profile-specific board filtering", () => {
  it("excludes react roles under backend policy", () => {
    const policy = loadAndCompileScanPolicy({
      configPath: join(paths.root, "config", "job-search-nodejs-backend.json"),
    });
    const posting = makePosting({
      title: "Senior Frontend Engineer",
      description: "React, TypeScript, remote worldwide.",
    });

    const { matched, excluded } = filterPostings([posting], policy);
    expect(matched).toHaveLength(0);
    expect(excluded[0]?.reason).toBe("Not Node.js/backend focused");
  });

  it("excludes backend roles under react policy", () => {
    const policy = loadAndCompileScanPolicy({ configPath: paths.jobSearchConfig });
    const posting = makePosting({
      title: "Node.js Backend Engineer",
      description: "NestJS APIs. Remote worldwide.",
    });

    const { matched } = filterPostings([posting], policy);
    expect(matched).toHaveLength(0);
  });
});
