import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpRequestError } from "../../src/lib/jobs/http-client.ts";
import {
  evaluateScanOutcome,
  fetchAllBoardPostings,
} from "../../src/lib/jobs/pipeline.ts";
import * as boards from "../../src/lib/jobs/boards/index.ts";
import { loadAndCompileScanPolicy } from "../../src/lib/jobs/scan-policy.ts";
import { runJobScan } from "../../src/lib/jobs/scan.ts";
import {
  applySourcePollUpdates,
  loadSourcePollState,
  migrateSourcePollState,
  resolveCadenceAnchor,
  saveSourcePollState,
  shouldSkipSourcePoll,
} from "../../src/lib/jobs/source-poll-state.ts";
import type { JobSourceEntry, SourceStats } from "../../src/lib/jobs/types.ts";
import { paths } from "../../src/lib/paths.ts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "refine-cv-phase5-"));
  tempDirs.push(dir);
  return dir;
}

function fixedClock(iso: string) {
  return () => new Date(iso);
}

describe("source poll cadence", () => {
  it("skips until minPollHours elapse from lastAttemptAt", () => {
    const now = new Date("2026-07-20T12:00:00.000Z");
    const skip = shouldSkipSourcePoll(
      { lastAttemptAt: "2026-07-20T10:00:00.000Z" },
      6,
      now,
      false,
    );
    expect(skip.skip).toBe(true);
    expect(skip.reason).toContain("minPollHours=6");
  });

  it("uses latest success/failure timestamp when lastAttemptAt is absent", () => {
    const now = new Date("2026-07-20T11:00:00.000Z");
    const skip = shouldSkipSourcePoll(
      {
        lastFailureAt: "2026-07-20T10:30:00.000Z",
        lastSuccessAt: "2026-07-20T09:00:00.000Z",
      },
      2,
      now,
      false,
    );
    expect(skip.skip).toBe(true);
  });

  it("allows fetch when --force is set", () => {
    const now = new Date("2026-07-20T10:30:00.000Z");
    expect(
      shouldSkipSourcePoll(
        { lastAttemptAt: "2026-07-20T10:00:00.000Z" },
        24,
        now,
        true,
      ).skip,
    ).toBe(false);
  });

  it("anchors cadence on the latest completion timestamp", () => {
    const entry = {
      lastAttemptAt: "2026-07-20T10:00:00.000Z",
      lastFailureAt: "2026-07-20T10:20:00.000Z",
    };
    expect(resolveCadenceAnchor(entry)).toBe(
      "2026-07-20T10:20:00.000Z",
    );
    expect(
      shouldSkipSourcePoll(
        entry,
        1,
        new Date("2026-07-20T11:10:00.000Z"),
        false,
      ).skip,
    ).toBe(true);
  });

  it("records attempt start and completion in the effective profile only", () => {
    const state = migrateSourcePollState({
      version: 1,
      sources: {
        jobicy: { lastAttemptAt: "2026-07-19T10:00:00.000Z" },
      },
    });
    expect(state.profiles.reactFrontend.jobicy).toBeDefined();
    expect(state.profiles.nodejsBackend).toEqual({});

    const next = applySourcePollUpdates(state, "nodejsBackend", [
      {
        sourceId: "jobicy",
        outcome: "success",
        attemptedAt: "2026-07-20T10:00:00.000Z",
        completedAt: "2026-07-20T10:15:00.000Z",
      },
    ]);
    expect(next.profiles.nodejsBackend.jobicy).toMatchObject({
      lastAttemptAt: "2026-07-20T10:00:00.000Z",
      lastSuccessAt: "2026-07-20T10:15:00.000Z",
    });
    expect(next.profiles.reactFrontend.jobicy?.lastAttemptAt).toBe(
      "2026-07-19T10:00:00.000Z",
    );
  });

  it("rejects malformed persisted timestamps", () => {
    expect(() =>
      migrateSourcePollState({
        version: 2,
        profiles: {
          reactFrontend: {
            jobicy: { lastAttemptAt: "not-a-timestamp" },
          },
          nodejsBackend: {},
        },
      }),
    ).toThrow();
  });
});

describe("fetchAllBoardPostings cadence", () => {
  it("marks cadence-skipped sources without fetch errors", async () => {
    const policy = loadAndCompileScanPolicy({ configPath: paths.jobSearchConfig });
    const sources: JobSourceEntry[] = [
      {
        id: "alpha",
        adapter: "jobicy",
        enabled: true,
        minPollHours: 24,
      },
      {
        id: "beta",
        adapter: "remotive",
        enabled: true,
        minPollHours: 24,
      },
    ];

    const result = await fetchAllBoardPostings({
      policy,
      sources,
      pollState: {
        version: 2,
        profiles: {
          reactFrontend: {
            alpha: { lastAttemptAt: "2026-07-20T09:00:00.000Z" },
            beta: { lastAttemptAt: "2026-07-20T09:00:00.000Z" },
          },
          nodejsBackend: {},
        },
      },
      forcePoll: false,
      now: fixedClock("2026-07-20T10:00:00.000Z"),
    });

    expect(result.sourceStats.map((stat) => stat.sourceId)).toEqual(["alpha", "beta"]);
    expect(result.sourceStats.every((stat) => stat.status === "skipped")).toBe(true);
    expect(result.fetchErrors).toHaveLength(0);
    expect(result.outcome.allSkippedDueToCadence).toBe(true);
    expect(result.pollStateUpdates).toHaveLength(0);
  });

  it("preserves configured source order under concurrent workers", async () => {
    const policy = loadAndCompileScanPolicy({ configPath: paths.jobSearchConfig });
    const sources: JobSourceEntry[] = [
      { id: "s1", adapter: "jobicy", enabled: true, minPollHours: 0 },
      { id: "s2", adapter: "remotive", enabled: true, minPollHours: 0 },
      { id: "s3", adapter: "arbeitnow", enabled: true, minPollHours: 0 },
      { id: "s4", adapter: "himalayas", enabled: true, minPollHours: 0 },
    ];
    const delays = new Map([
      ["s1", 30],
      ["s2", 10],
      ["s3", 20],
      ["s4", 5],
    ]);

    vi.spyOn(boards, "getBoardAdapter").mockImplementation((adapter) => ({
      id: adapter as JobSourceEntry["adapter"],
      fetch: async (source: JobSourceEntry) => {
        await new Promise((resolve) => setTimeout(resolve, delays.get(source.id) ?? 0));
        return {
          sourceId: source.id,
          adapter: source.adapter,
          postings: [],
          quarantined: 0,
        };
      },
    }));

    const result = await fetchAllBoardPostings({
      policy,
      sources,
      pollState: {
        version: 2,
        profiles: { reactFrontend: {}, nodejsBackend: {} },
      },
      forcePoll: true,
      now: fixedClock("2026-07-20T10:00:00.000Z"),
    });

    expect(result.sourceStats.map((stat) => stat.sourceId)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
    ]);
    expect(result.blocklistExcluded).toBe(0);
  });

  it("does not let React cadence suppress a backend profile fetch", async () => {
    const policy = loadAndCompileScanPolicy({
      configPath: paths.jobSearchConfig,
      profileOverride: "nodejsBackend",
    });
    const fetch = vi.fn(async (source: JobSourceEntry) => ({
      sourceId: source.id,
      adapter: source.adapter,
      postings: [],
      quarantined: 0,
    }));
    vi.spyOn(boards, "getBoardAdapter").mockReturnValue({
      id: "jobicy",
      fetch,
    });

    const result = await fetchAllBoardPostings({
      policy,
      sources: [
        {
          id: "jobicy",
          adapter: "jobicy",
          enabled: true,
          minPollHours: 24,
        },
      ],
      pollState: {
        version: 2,
        profiles: {
          reactFrontend: {
            jobicy: { lastAttemptAt: "2026-07-20T09:00:00.000Z" },
          },
          nodejsBackend: {},
        },
      },
      now: fixedClock("2026-07-20T10:00:00.000Z"),
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.sourceStats[0].status).toBe("success");
  });
});

describe("scan outcome classification", () => {
  it("distinguishes total outage from all-skipped cadence", () => {
    const allSkipped: SourceStats[] = [
      {
        sourceId: "a",
        adapter: "jobicy",
        status: "skipped",
        fetched: 0,
        normalized: 0,
        quarantined: 0,
        matched: 0,
        durationMs: 0,
        failed: false,
      },
    ];
    const outage: SourceStats[] = [
      {
        sourceId: "a",
        adapter: "jobicy",
        status: "failure",
        fetched: 0,
        normalized: 0,
        quarantined: 0,
        matched: 0,
        durationMs: 12,
        failed: true,
      },
    ];

    expect(evaluateScanOutcome(allSkipped).allSkippedDueToCadence).toBe(true);
    expect(evaluateScanOutcome(allSkipped).totalSourceOutage).toBe(false);
    expect(evaluateScanOutcome(outage).totalSourceOutage).toBe(true);
  });
});

describe("runJobScan poll-state durability", () => {
  it("does not advance poll state when artifact publication fails", async () => {
    const root = makeTempDir();
    const pollStatePath = join(root, "source-poll-state.json");
    saveSourcePollState(
      {
        version: 2,
        profiles: { reactFrontend: {}, nodejsBackend: {} },
      },
      pollStatePath,
    );

    await expect(
      runJobScan({
        configPath: paths.jobSearchConfig,
        paths: {
          jobsDir: join(root, "jobs"),
          scanStatePath: join(root, "scan-state.json"),
          lifecycleStatePath: join(root, "applied-jobs.json"),
          sourcePollStatePath: pollStatePath,
          lockPath: join(root, "job-scan.lock"),
        },
        clock: {
          now: fixedClock("2026-07-20T10:00:00.000Z"),
          randomSuffix: () => "abc123",
        },
        runPipeline: async () => ({
          fetchedAt: "2026-07-20T10:00:00.000Z",
          allRaw: [],
          matched: [],
          excluded: [],
          fetchErrors: [],
          sourceStats: [
            {
              sourceId: "jobicy",
              adapter: "jobicy",
              status: "failure",
              fetched: 0,
              normalized: 0,
              quarantined: 0,
              matched: 0,
              durationMs: 1,
              failed: true,
            },
          ],
          blocklistExcluded: 0,
          dedupeSummary: { inputCount: 0, outputCount: 0, mergedCount: 0 },
          pollStateUpdates: [
            {
              sourceId: "jobicy",
              outcome: "failure",
              attemptedAt: "2026-07-20T10:00:00.000Z",
              completedAt: "2026-07-20T10:00:01.000Z",
              error: { message: "HTTP 503" },
            },
          ],
          hadSuccessfulSourceFetch: false,
          outcome: {
            attemptedSources: 1,
            skippedSources: 0,
            succeededSources: 0,
            failedSources: 1,
            allSkippedDueToCadence: false,
            totalSourceOutage: true,
          },
        }),
        publishArtifacts: () => {
          throw new Error("artifact publish failed");
        },
      }),
    ).rejects.toThrow("artifact publish failed");

    expect(
      loadSourcePollState(pollStatePath).profiles.reactFrontend,
    ).toEqual({});
  });
});

describe("HttpRequestError surfaces in fetch errors", () => {
  it("retains status and attempts without response body", () => {
    const error = new HttpRequestError("HTTP 429 for https://example.com", {
      url: "https://example.com",
      status: 429,
      attempts: 2,
      retryable: true,
      retryAfterMs: 1_000,
    });
    expect(error.message).toContain("429");
    expect(error.attempts).toBe(2);
    expect(String(error)).not.toContain("body");
  });
});
