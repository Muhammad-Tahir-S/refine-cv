import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import { join } from "node:path";
import { paths } from "../../src/lib/paths.ts";
import { fixturePaths } from "./helpers/fixture-paths.ts";
import { SCAN_ARTIFACT_NAMES } from "../../src/lib/jobs/artifact-names.ts";
import {
  assertNoSensitivePaths,
  buildRunManifest,
  deriveRunOutcomeStatus,
  readGitCommitSafely,
  readRunEnvironmentMetadata,
  redactSensitivePaths,
  RunManifestSchema,
  sanitizeForScanArtifact,
  serializeRunManifest,
  serializeScanResult,
  sha256Hex,
} from "../../src/lib/jobs/manifest.ts";
import {
  escapeMarkdownTableCell,
  escapeMarkdownHeading,
  formatChecklistLine,
  formatMarkdownLink,
  sanitizeHttpUrl,
} from "../../src/lib/jobs/markdown-safe.ts";
import { renderScanReport } from "../../src/lib/jobs/report.ts";
import { loadAndCompileScanPolicy, serializeScanPolicy } from "../../src/lib/jobs/scan-policy.ts";
import {
  migrateLatestRunPointerV1ToV2,
  parseLatestRunPointer,
  publishScanArtifacts,
  resolveRunDirectory,
  scanRunDirName,
} from "../../src/lib/jobs/scan-run.ts";
import { normalizeRawPosting } from "../../src/lib/jobs/normalize.ts";
import { parseAppliedCheckboxesFromReport } from "../../src/lib/jobs/state.ts";
import { makeScanRunResult } from "./helpers/scan-result-fixture.js";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "refine-cv-manifest-"));
  tempDirs.push(dir);
  return dir;
}

describe("manifest fingerprints", () => {
  it("hashes config bytes deterministically", () => {
    const content = '{"version":1}\n';
    const first = sha256Hex(content);
    const second = sha256Hex(content);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses injected git rev-parse and environment fallback safely", () => {
    expect(
      readGitCommitSafely("/worktree", {
        env: {},
        runGit: (root) => {
          expect(root).toBe("/worktree");
          return "abcdef1234567890";
        },
      }),
    ).toBe("abcdef1234567890");
    expect(
      readGitCommitSafely("/not-git", {
        env: { GITHUB_SHA: "1234567890abcdef" },
        runGit: () => {
          throw new Error("must not run");
        },
      }),
    ).toBe("1234567890abcdef");
    expect(
      readGitCommitSafely("/not-git", {
        env: {},
        runGit: () => {
          throw new Error("outside git");
        },
      }),
    ).toBeUndefined();
  });

  it("reads repo-relative config labels and metadata without git", () => {
    const metadata = readRunEnvironmentMetadata(
      fixturePaths.jobSearchReact,
      paths.jobSourcesConfig,
      {
        readApplicationVersion: () => "0.1.0-test",
        readGitCommit: () => undefined,
        readJobSearchConfig: (configPath) => ({
          label: "config/job-search.json",
          sha256: sha256Hex("job-search"),
        }),
        readJobSourcesConfig: (configPath) => ({
          label: "config/job-sources.json",
          sha256: sha256Hex("job-sources"),
          version: 1,
        }),
      },
    );

    expect(metadata.jobSearchConfig.label).toBe("config/job-search.json");
    expect(metadata.jobSourcesConfig.label).toBe("config/job-sources.json");
    expect(metadata.applicationVersion).toBe("0.1.0-test");
    expect(metadata.gitCommit).toBeUndefined();
  });
});

describe("run manifest", () => {
  it("builds a versioned manifest with UTC duration and pipeline totals", () => {
    const policy = loadAndCompileScanPolicy({ configPath: fixturePaths.jobSearchReact });
    const posting = normalizeRawPosting(
      {
        sourceId: "remoteok",
        sourceJobId: "1",
        company: "Acme",
        title: "Senior React Engineer",
        url: "https://example.com/jobs/1",
        location: "Worldwide",
        description: "React role",
      },
      "2026-07-20T10:00:00.000Z",
    );
    posting.geoEligibility = "nigeria_eligible";

    const result = makeScanRunResult({
      policy: serializeScanPolicy(policy),
      policyMatched: 2,
      allMatched: [posting],
      lifecycleSuppressed: { applied: 1, dismissed: 0, expired: 0 },
      exclusionsByReason: { "Level not allowed: junior": 3 },
      sourceStats: [
        {
          sourceId: "remoteok",
          adapter: "remoteok",
          status: "success",
          fetched: 10,
          normalized: 10,
          quarantined: 1,
          matched: 1,
          durationMs: 1200,
          attemptedAt: "2026-07-20T10:00:01.000Z",
          completedAt: "2026-07-20T10:00:02.200Z",
          requestUrls: ["https://remoteok.com/api?tags=frontend"],
          failed: false,
        },
      ],
      sourceCatalog: [
        {
          configuredSourceId: "remoteok",
          adapter: "remoteok",
          boardName: "Remote OK",
          attribution: "Jobs via Remote OK (https://remoteok.com/)",
          minPollHours: 24,
        },
      ],
    });

    const manifest = buildRunManifest({
      result,
      startedAt: "2026-07-20T10:00:00.000Z",
      completedAt: "2026-07-20T10:00:05.000Z",
      forcePoll: false,
      sourceEntries: [
        {
          id: "remoteok",
          adapter: "remoteok",
          enabled: true,
          minPollHours: 24,
          attribution: "Jobs via Remote OK (https://remoteok.com/)",
          tags: "frontend,react,dev",
        },
      ],
      metadata: {
        applicationVersion: "0.1.0",
        gitCommit: "abc1234",
        jobSearchConfig: {
          label: "config/job-search.json",
          sha256: sha256Hex("job-search"),
        },
        jobSourcesConfig: {
          label: "config/job-sources.json",
          sha256: sha256Hex("job-sources"),
        },
        sourceConfigVersion: 1,
      },
    });

    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.durationMs).toBe(5000);
    expect(manifest.pipeline.policyMatched).toBe(2);
    expect(manifest.pipeline.activeMatched).toBe(1);
    expect(manifest.pipeline.lifecycleSuppressed.applied).toBe(1);
    expect(manifest.outcome.status).toBe("success");
    expect(manifest.sources[0]?.attribution).toContain("Remote OK");
    expect(manifest.artifacts.scanResult).toBe("scan-result.json");
    expect(RunManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it("rejects malformed manifests before serialization", () => {
    const malformed = {
      ...buildRunManifest({
        result: makeScanRunResult(),
        startedAt: "2026-07-20T10:00:00.000Z",
        completedAt: "2026-07-20T10:00:05.000Z",
        forcePoll: false,
        sourceEntries: [],
        metadata: {
          applicationVersion: "0.1.0",
          jobSearchConfig: {
            label: "config/job-search.json",
            sha256: sha256Hex("search"),
          },
          jobSourcesConfig: {
            label: "config/job-sources.json",
            sha256: sha256Hex("sources"),
          },
          sourceConfigVersion: 1,
        },
      }),
      durationMs: -1,
    };
    expect(() => serializeRunManifest(malformed)).toThrow();
  });

  it("derives partial, outage, and cadence-skipped outcomes", () => {
    expect(
      deriveRunOutcomeStatus({
        attemptedSources: 2,
        skippedSources: 0,
        succeededSources: 1,
        failedSources: 1,
        allSkippedDueToCadence: false,
        totalSourceOutage: false,
      }),
    ).toBe("partial");

    expect(
      deriveRunOutcomeStatus({
        attemptedSources: 2,
        skippedSources: 0,
        succeededSources: 0,
        failedSources: 2,
        allSkippedDueToCadence: false,
        totalSourceOutage: true,
      }),
    ).toBe("total_outage");

    expect(
      deriveRunOutcomeStatus({
        attemptedSources: 0,
        skippedSources: 3,
        succeededSources: 0,
        failedSources: 0,
        allSkippedDueToCadence: true,
        totalSourceOutage: false,
      }),
    ).toBe("all_cadence_skipped");
  });
});

describe("artifact serialization safety", () => {
  it("omits absolute outputDir and rejects sensitive paths in artifacts", () => {
    const result = makeScanRunResult({
      outputDir: "/Users/me/refine-cv/jobs/run-job-scan",
    });
    const json = serializeScanResult(result);
    expect(json).not.toContain("outputDir");
    expect(json).not.toContain("/Users/me");
    assertNoSensitivePaths(JSON.parse(json));

    const manifestJson = serializeRunManifest(
      buildRunManifest({
        result,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        forcePoll: false,
        sourceEntries: [],
        metadata: {
          applicationVersion: "0.1.0",
          jobSearchConfig: {
            label: "config/job-search.json",
            sha256: sha256Hex("x"),
          },
          jobSourcesConfig: {
            label: "config/job-sources.json",
            sha256: sha256Hex("y"),
          },
          sourceConfigVersion: 1,
        },
      }),
    );
    assertNoSensitivePaths(JSON.parse(manifestJson));
  });

  it("converts Error objects during sanitization", () => {
    expect(sanitizeForScanArtifact({
      err: new Error("boom at /private/tmp/response.json"),
    })).toEqual({
      err: { name: "Error", message: "boom at [redacted-path]" },
    });
  });

  it("redacts generic paths, embedded errors, credentials, and caps strings", () => {
    const input = [
      "failed at /tmp/secrets/file.json",
      "cache /private/var/data",
      "binary /opt/refine/bin",
      "home /Users/alice/project",
      "windows C:\\Users\\alice\\secret.txt",
      "unc \\\\server\\share\\secret.txt",
      "url https://user:pass@example.com/jobs/1",
    ].join("; ");
    const redacted = redactSensitivePaths(`${input}; ${"x".repeat(5000)}`);
    expect(redacted).not.toContain("/tmp/");
    expect(redacted).not.toContain("/private/");
    expect(redacted).not.toContain("/opt/");
    expect(redacted).not.toContain("/Users/");
    expect(redacted).not.toContain("C:\\Users");
    expect(redacted).not.toContain("\\\\server\\share");
    expect(redacted).not.toContain("user:pass");
    expect(redacted).toContain("https://example.com/jobs/1");
    expect(redacted.length).toBeLessThanOrEqual(4096);

    const json = serializeScanResult(
      makeScanRunResult({
        fetchErrors: [{
          sourceId: "jobicy",
          adapter: "jobicy",
          error: "ENOENT opening /tmp/private-response.json",
        }],
      }),
    );
    expect(json).toContain("[redacted-path]");
    expect(json).not.toContain("/tmp/");
    assertNoSensitivePaths(JSON.parse(json));
  });
});

describe("report wording and attribution", () => {
  it("includes source attribution and distinguishes active vs lifecycle counts", () => {
    const markdown = renderScanReport(
      makeScanRunResult({
        policyMatched: 3,
        allMatched: [],
        lifecycleSuppressed: { applied: 2, dismissed: 1, expired: 0 },
        sourceCatalog: [
          {
            configuredSourceId: "remotive",
            adapter: "remotive",
            boardName: "Remotive",
            attribution: "Jobs via Remotive (https://remotive.com/)",
            minPollHours: 6,
          },
        ],
        sourceStats: [
          {
            sourceId: "remotive",
            adapter: "remotive",
            status: "success",
            fetched: 5,
            normalized: 5,
            quarantined: 0,
            matched: 0,
            durationMs: 900,
            requestUrls: ["https://remotive.com/api/remote-jobs"],
            failed: false,
          },
        ],
      }),
    );

    expect(markdown).toContain("Source attribution");
    expect(markdown).toContain("Source yield");
    expect(markdown).toContain("Jobs via Remotive");
    expect(markdown).toContain("Policy matched (after filters) | 3");
    expect(markdown).toContain("Active matched (lifecycle-adjusted) | 0");
    expect(markdown).toContain("scan-result.json");
    expect(markdown).toContain("manifest.json");
  });

  it("describes cadence skip vs zero-match vs partial failure vs outage", () => {
    const cadence = renderScanReport(
      makeScanRunResult({
        outcome: {
          attemptedSources: 0,
          skippedSources: 4,
          succeededSources: 0,
          failedSources: 0,
          allSkippedDueToCadence: true,
          totalSourceOutage: false,
        },
        hadSuccessfulSourceFetch: false,
      }),
    );
    expect(cadence).toContain("cadence");
    expect(cadence).toContain("Cadence skip");

    const outage = renderScanReport(
      makeScanRunResult({
        outcome: {
          attemptedSources: 2,
          skippedSources: 0,
          succeededSources: 0,
          failedSources: 2,
          allSkippedDueToCadence: false,
          totalSourceOutage: true,
        },
        hadSuccessfulSourceFetch: false,
      }),
    );
    expect(outage).toContain("Total source outage");

    const partial = renderScanReport(
      makeScanRunResult({
        outcome: {
          attemptedSources: 3,
          skippedSources: 0,
          succeededSources: 2,
          failedSources: 1,
          allSkippedDueToCadence: false,
          totalSourceOutage: false,
        },
      }),
    );
    expect(partial).toContain("Partial source failure");
  });
});

describe("markdown escaping", () => {
  it("escapes malicious table, checklist, and URL injection", () => {
    const cell = escapeMarkdownTableCell("Evil | inject <script>alert(1)</script>");
    expect(cell).toContain("\\|");
    expect(cell).not.toContain("\\\\|");
    expect(cell).not.toContain("<script>");
    const row = `| ${cell} | fixed |`;
    expect(row.match(/(?<!\\)\|/g)).toHaveLength(3);

    const checklist = formatChecklistLine(
      true,
      "Co — <b>bad</b>",
      "Title — injected",
      "https://user:pass@example.com/job?q=1",
    );
    expect(checklist.match(/ — /g)).toHaveLength(2);
    expect(checklist).not.toContain("<b>");
    expect(checklist).not.toContain("user:pass");
    const parsed = parseAppliedCheckboxesFromReport(checklist, "report.md");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.company).toBe("Co &mdash; <b>bad</b>");
    expect(parsed[0]?.title).toBe("Title &mdash; injected");
    expect(sanitizeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(formatMarkdownLink("click", "javascript:alert(1)")).toBe("click");
    expect(formatMarkdownLink("ok", "https://example.com/a)(b")).toContain("https://example.com");
  });

  it("round-trips every checklist inline escape without active injection", () => {
    const company =
      "[click](https://evil.example) ![image](https://evil.example/i) " +
      String.raw`*Acme* \ path <b>x</b> — &lt;literal&gt;`;
    const title =
      String.raw`` + "`code` (role) [label] **bold** \\server — <i>title</i>";
    const checklist = formatChecklistLine(
      true,
      company,
      title,
      "https://example.com/jobs/1",
    );

    expect(checklist).not.toContain("[click](");
    expect(checklist).not.toContain("![image](");
    expect(checklist).not.toContain("<b>");
    expect(checklist).not.toContain("<i>");
    expect(checklist).toContain("\\[click\\]");
    expect(checklist).toContain("\\*Acme\\*");
    expect(checklist).toContain("\\`code\\`");
    expect(checklist).toContain("\\\\ path");
    expect(checklist.match(/ — /g)).toHaveLength(2);

    const parsed = parseAppliedCheckboxesFromReport(checklist, "report.md");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.company).toBe(
      "[click](https://evil.example) ![image](https://evil.example/i) " +
        String.raw`*Acme* \ path <b>x</b> &mdash; &lt;literal&gt;`,
    );
    expect(parsed[0]?.title).toBe(
      "`code` (role) [label] **bold** \\server &mdash; <i>title</i>",
    );
  });

  it("neutralizes HTML and Markdown in source-controlled headings", () => {
    const heading = escapeMarkdownHeading("<img src=x> [click](https://evil) # title");
    expect(heading).not.toContain("<img");
    expect(heading).not.toContain("[click](");
    expect(heading).toContain("&lt;img src=x&gt;");
  });

  it("renders multiple request URLs as separate safe links", () => {
    const markdown = renderScanReport(makeScanRunResult({
      sourceCatalog: [{
        configuredSourceId: "wwr",
        adapter: "wwr",
        boardName: "We Work Remotely",
        attribution: "Jobs via WWR",
        minPollHours: 6,
      }],
      sourceStats: [{
        sourceId: "wwr",
        adapter: "wwr",
        status: "success",
        fetched: 1,
        normalized: 1,
        quarantined: 0,
        matched: 1,
        durationMs: 10,
        requestUrls: [
          "https://example.com/feed/front-end",
          "https://example.com/feed/full-stack",
        ],
        failed: false,
      }],
    }));
    expect(markdown).toContain("Request 1");
    expect(markdown).toContain("Request 2");
    expect(markdown).not.toContain("front-end, https://");
  });
});

describe("publication and pointer migration", () => {
  it("publishes report, scan-result, and manifest before rename", () => {
    const dir = makeTempDir();
    const runId = "20260720T100000Z-react-frontend-pub001";
    const finalOutputDir = join(dir, scanRunDirName(runId));
    const stagingOutputDir = join(dir, `.staging-${scanRunDirName(runId)}`);

    publishScanArtifacts({
      jobsDir: dir,
      runId,
      finalOutputDir,
      stagingOutputDir,
      scanResultJson: '{"ok":true}\n',
      reportMarkdown: "# report\n",
      manifestJson: '{"schemaVersion":1}\n',
    });

    expect(existsSync(join(finalOutputDir, SCAN_ARTIFACT_NAMES.report))).toBe(true);
    expect(existsSync(join(finalOutputDir, SCAN_ARTIFACT_NAMES.scanResult))).toBe(true);
    expect(existsSync(join(finalOutputDir, SCAN_ARTIFACT_NAMES.manifest))).toBe(true);
    expect(existsSync(stagingOutputDir)).toBe(false);
  });

  it("migrates v1 latest-run pointers and resolves linked output paths", () => {
    const migrated = migrateLatestRunPointerV1ToV2({
      version: 1,
      runId: "run-old",
      roleProfile: "reactFrontend",
      outputDir: "/tmp/jobs/20260718T120000Z-react-frontend-old-job-scan",
      publishedAt: "2026-07-18T12:00:00.000Z",
    });

    expect(migrated.version).toBe(2);
    expect(migrated.runDirName).toBe("20260718T120000Z-react-frontend-old-job-scan");
    expect(migrated.artifacts.scanResult).toBe(SCAN_ARTIFACT_NAMES.scanResult);

    const jobsDir = "/tmp/jobs-root";
    expect(resolveRunDirectory(jobsDir, migrated)).toBe(
      join(jobsDir, migrated.runDirName),
    );
    expect(resolveRunDirectory(jobsDir, {
      version: 1,
      runId: "20260718T120000Z-react-frontend-old",
      roleProfile: "reactFrontend",
      outputDir: "/attacker/root/20260718T120000Z-react-frontend-old-job-scan",
      publishedAt: "2026-07-18T12:00:00.000Z",
    })).toBe(
      join(jobsDir, "20260718T120000Z-react-frontend-old-job-scan"),
    );
  });

  it("rejects traversing and tampered v2 pointers", () => {
    const base = {
      version: 2,
      runId: "20260720T100000Z-react-frontend-safe01",
      roleProfile: "reactFrontend",
      runDirName: "20260720T100000Z-react-frontend-safe01-job-scan",
      artifacts: {
        report: "report.md",
        scanResult: "scan-result.json",
        manifest: "manifest.json",
      },
      publishedAt: "2026-07-20T10:00:00.000Z",
    } as const;
    expect(parseLatestRunPointer(base, "reactFrontend")).toEqual(base);
    expect(parseLatestRunPointer({
      ...base,
      runDirName: "../outside-job-scan",
    }, "reactFrontend")).toBeNull();
    expect(parseLatestRunPointer({
      ...base,
      artifacts: { ...base.artifacts, report: "../report.md" },
    }, "reactFrontend")).toBeNull();
    expect(parseLatestRunPointer({
      ...base,
      roleProfile: "nodejsBackend",
    }, "reactFrontend")).toBeNull();
    expect(parseLatestRunPointer({
      ...base,
      publishedAt: "not-a-date",
    }, "reactFrontend")).toBeNull();
  });
});

describe("sha256 fixture", () => {
  it("matches known vector for empty string", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
