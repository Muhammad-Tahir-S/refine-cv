import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeLegacyDedupeKey } from "../../src/lib/jobs/dedupe.ts";
import { makeTestPosting } from "../../src/lib/jobs/normalize.ts";
import { partitionScanResults } from "../../src/lib/jobs/pipeline.ts";
import type { JobPosting } from "../../src/lib/jobs/types.ts";
import {
  loadJobLifecycleState,
  loadLinkedInDiscoveryState,
  loadScanState,
  markJobApplied,
  markJobDismissed,
  markJobExpired,
  mergeAppliedFromReports,
  migrateJobLifecycleState,
  migrateLinkedInDiscoveryState,
  migrateScanState,
  saveJobLifecycleState,
  saveLinkedInDiscoveryState,
  saveScanState,
  UnsupportedStateVersionError,
  updateScanState,
} from "../../src/lib/jobs/state.ts";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "refine-cv-state-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function samplePosting(overrides: Partial<JobPosting> = {}): JobPosting {
  return makeTestPosting({
    company: "Acme",
    title: "React Engineer",
    url: "https://example.com/jobs/react",
    ...overrides,
  });
}

describe("scan state migration", () => {
  it("migrates v2 seen map into reactFrontend profile", () => {
    const entry = {
      dedupeKey: "url::https://example.com/jobs/1",
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/1",
      firstSeenAt: "2026-07-01T00:00:00.000Z",
      lastSeenAt: "2026-07-10T00:00:00.000Z",
    };

    const migrated = migrateScanState({
      version: 2,
      seen: { [entry.dedupeKey]: entry },
    });

    expect(migrated.version).toBe(3);
    expect(migrated.profiles.reactFrontend[entry.dedupeKey]).toEqual(entry);
    expect(migrated.profiles.nodejsBackend).toEqual({});
  });

  it("loads and persists v3 state at an explicit path", () => {
    const dir = makeTempDir();
    const statePath = join(dir, "scan-state.json");

    saveScanState({ version: 3, profiles: { reactFrontend: {}, nodejsBackend: {} } }, statePath);
    const loaded = loadScanState(statePath);
    expect(loaded.version).toBe(3);
  });

  it("rejects unsupported scan state versions", () => {
    expect(() => migrateScanState({ version: 99, seen: {} })).toThrow(
      UnsupportedStateVersionError,
    );
  });
});

describe("job lifecycle migration", () => {
  it("migrates v1 applied map to v2 lifecycle without data loss", () => {
    const appliedAt = "2026-06-01T08:00:00.000Z";
    const job = {
      dedupeKey: "acme::react engineer",
      company: "Acme",
      title: "React Engineer",
      url: "https://example.com/jobs/react",
      appliedAt,
    };

    const migrated = migrateJobLifecycleState({ version: 1, applied: { [job.dedupeKey]: job } });

    expect(migrated.version).toBe(2);
    expect(migrated.applied[job.dedupeKey]).toEqual(job);
    expect(migrated.dismissed).toEqual({});
    expect(migrated.expired).toEqual({});
  });

  it("preserves appliedAt across repeated checkbox sync", () => {
    const dir = makeTempDir();
    const lifecyclePath = join(dir, "applied-jobs.json");
    const jobsDir = join(dir, "jobs");
    const scanDir = join(jobsDir, "2026-07-18-job-scan");
    mkdirSync(scanDir, { recursive: true });

    const originalAppliedAt = "2026-06-01T08:00:00.000Z";
    saveJobLifecycleState(
      {
        version: 2,
        applied: {
          "acme::react engineer": {
            dedupeKey: "acme::react engineer",
            company: "Acme",
            title: "React Engineer",
            url: "https://example.com/jobs/react",
            appliedAt: originalAppliedAt,
          },
        },
        dismissed: {},
        expired: {},
      },
      lifecyclePath,
    );

    writeFileSync(
      join(scanDir, "report.md"),
      "- [x] Acme — React Engineer — https://example.com/jobs/react\n",
    );

    const merged = mergeAppliedFromReports(jobsDir, lifecyclePath);
    expect(merged.applied["acme::react engineer"].appliedAt).toBe(originalAppliedAt);
  });

  it("transitions dismissed URL state to applied legacy state during checkbox sync", () => {
    const dir = makeTempDir();
    const lifecyclePath = join(dir, "applied-jobs.json");
    const jobsDir = join(dir, "jobs");
    const scanDir = join(jobsDir, "2026-07-18-job-scan");
    const urlKey = "url::https://example.com/jobs/react";
    mkdirSync(scanDir, { recursive: true });
    saveJobLifecycleState(
      {
        version: 2,
        applied: {},
        dismissed: {
          [urlKey]: {
            dedupeKey: urlKey,
            company: "Acme",
            title: "React Engineer",
            url: "https://example.com/jobs/react",
            dismissedAt: "2026-07-01T00:00:00.000Z",
          },
        },
        expired: {},
      },
      lifecyclePath,
    );
    writeFileSync(
      join(scanDir, "report.md"),
      "- [x] Acme — React Engineer — https://example.com/jobs/react\n",
    );

    const merged = mergeAppliedFromReports(jobsDir, lifecyclePath);

    expect(Object.keys(merged.applied)).toEqual(["acme::react engineer"]);
    expect(merged.dismissed).toEqual({});
    expect(merged.expired).toEqual({});
  });

  it("transitions expired legacy state to applied URL state", () => {
    const dir = makeTempDir();
    const lifecyclePath = join(dir, "applied-jobs.json");
    const legacyKey = "acme::react engineer";
    saveJobLifecycleState(
      {
        version: 2,
        applied: {},
        dismissed: {},
        expired: {
          [legacyKey]: {
            dedupeKey: legacyKey,
            company: "Acme",
            title: "React Engineer",
            url: "https://example.com/jobs/react",
            expiredAt: "2026-07-01T00:00:00.000Z",
          },
        },
      },
      lifecyclePath,
    );

    const next = markJobApplied(
      {
        dedupeKey: "url::https://example.com/jobs/react",
        company: "Acme",
        title: "React Engineer",
        url: "https://example.com/jobs/react",
        appliedAt: "2026-07-10T00:00:00.000Z",
      },
      lifecyclePath,
    );

    expect(Object.keys(next.applied)).toEqual([
      "url::https://example.com/jobs/react",
    ]);
    expect(next.dismissed).toEqual({});
    expect(next.expired).toEqual({});
  });
});

describe("profile isolation and partitioning", () => {
  it("does not mark react jobs seen in nodejs profile map", () => {
    const posting = samplePosting();
    const scanState = updateScanState(
      { version: 3, profiles: { reactFrontend: {}, nodejsBackend: {} } },
      "nodejsBackend",
      [
        {
          dedupeKey: posting.dedupeKey,
          company: posting.company,
          title: posting.title,
          url: posting.url,
          firstSeenAt: "2026-07-18T12:00:00.000Z",
          lastSeenAt: "2026-07-18T12:00:00.000Z",
        },
      ],
    );

    expect(scanState.profiles.nodejsBackend[posting.dedupeKey]).toBeDefined();
    expect(scanState.profiles.reactFrontend[posting.dedupeKey]).toBeUndefined();
  });

  it("partitions lifecycle-suppressed jobs out of active results", () => {
    const posting = samplePosting();
    const legacyKey = posting.legacyDedupeKey;

    const scanState = {
      version: 3 as const,
      profiles: {
        reactFrontend: {},
        nodejsBackend: {},
      },
    };

    const lifecycle = {
      version: 2 as const,
      applied: {
        [legacyKey]: {
          dedupeKey: legacyKey,
          company: posting.company,
          title: posting.title,
          url: posting.url,
          appliedAt: "2026-06-01T00:00:00.000Z",
        },
      },
      dismissed: {},
      expired: {},
    };

    const result = partitionScanResults([posting], scanState, lifecycle, "reactFrontend");

    expect(result.activeMatched).toHaveLength(0);
    expect(result.newJobs).toHaveLength(0);
    expect(result.previouslySeen).toHaveLength(0);
    expect(result.lifecycleSuppressed.applied).toBe(1);
  });

  it("keeps dismissed and expired jobs out of active tables", () => {
    const posting = samplePosting();
    const lifecycle = {
      version: 2 as const,
      applied: {},
      dismissed: {
        [posting.dedupeKey]: {
          dedupeKey: posting.dedupeKey,
          company: posting.company,
          title: posting.title,
          url: posting.url,
          dismissedAt: "2026-07-01T00:00:00.000Z",
        },
      },
      expired: {},
    };

    const dismissed = partitionScanResults(
      [posting],
      { version: 3, profiles: { reactFrontend: {}, nodejsBackend: {} } },
      lifecycle,
      "reactFrontend",
    );
    expect(dismissed.lifecycleSuppressed.dismissed).toBe(1);

    const expiredLifecycle = {
      ...lifecycle,
      dismissed: {},
      expired: {
        [posting.dedupeKey]: {
          dedupeKey: posting.dedupeKey,
          company: posting.company,
          title: posting.title,
          url: posting.url,
          expiredAt: "2026-07-02T00:00:00.000Z",
        },
      },
    };

    const expired = partitionScanResults(
      [posting],
      { version: 3, profiles: { reactFrontend: {}, nodejsBackend: {} } },
      expiredLifecycle,
      "reactFrontend",
    );
    expect(expired.lifecycleSuppressed.expired).toBe(1);
  });

  it("preserves firstSeenAt when updating seen entries", () => {
    const posting = samplePosting();
    const firstSeenAt = "2026-07-01T00:00:00.000Z";

    let state = {
      version: 3 as const,
      profiles: {
        reactFrontend: {
          [posting.dedupeKey]: {
            dedupeKey: posting.dedupeKey,
            company: posting.company,
            title: posting.title,
            url: posting.url,
            firstSeenAt,
            lastSeenAt: "2026-07-05T00:00:00.000Z",
          },
        },
        nodejsBackend: {},
      },
    };

    const observedAt = "2026-07-20T10:00:00.000Z";
    state = updateScanState(
      state,
      "reactFrontend",
      [
        {
          dedupeKey: posting.dedupeKey,
          company: posting.company,
          title: posting.title,
          url: posting.url,
          firstSeenAt: posting.fetchedAt,
          lastSeenAt: posting.fetchedAt,
        },
      ],
      observedAt,
    );

    expect(state.profiles.reactFrontend[posting.dedupeKey].firstSeenAt).toBe(firstSeenAt);
    expect(state.profiles.reactFrontend[posting.dedupeKey].lastSeenAt).toBe(observedAt);
  });

  it("preserves supplied firstSeenAt and records observation time for new entries", () => {
    const posting = samplePosting();
    const observedAt = "2026-07-20T10:00:00.000Z";
    const state = updateScanState(
      { version: 3, profiles: { reactFrontend: {}, nodejsBackend: {} } },
      "reactFrontend",
      [
        {
          dedupeKey: posting.dedupeKey,
          company: posting.company,
          title: posting.title,
          url: posting.url,
          firstSeenAt: posting.fetchedAt,
          lastSeenAt: posting.fetchedAt,
        },
      ],
      observedAt,
    );

    expect(state.profiles.reactFrontend[posting.dedupeKey].firstSeenAt).toBe(
      posting.fetchedAt,
    );
    expect(state.profiles.reactFrontend[posting.dedupeKey].lastSeenAt).toBe(
      observedAt,
    );
  });

  it("matches legacy company::title keys in seen and lifecycle maps", () => {
    const posting = samplePosting();
    const legacyKey = posting.legacyDedupeKey;

    const scanState = {
      version: 3 as const,
      profiles: {
        reactFrontend: {
          [legacyKey]: {
            dedupeKey: legacyKey,
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

    const result = partitionScanResults([posting], scanState, {
      version: 2,
      applied: {},
      dismissed: {},
      expired: {},
    }, "reactFrontend");

    expect(result.previouslySeen).toHaveLength(1);
    expect(result.newJobs).toHaveLength(0);
  });
});

describe("lifecycle mark APIs", () => {
  it("marks dismissed without duplicating terminal records", () => {
    const dir = makeTempDir();
    const lifecyclePath = join(dir, "applied-jobs.json");
    const legacyKey = makeLegacyDedupeKey("Acme", "React Engineer");

    saveJobLifecycleState(
      {
        version: 2,
        applied: {
          [legacyKey]: {
            dedupeKey: legacyKey,
            company: "Acme",
            title: "React Engineer",
            url: "https://example.com/jobs/react",
            appliedAt: "2026-06-01T00:00:00.000Z",
          },
        },
        dismissed: {},
        expired: {},
      },
      lifecyclePath,
    );

    const next = markJobDismissed(
      {
        dedupeKey: "url::https://example.com/jobs/react",
        company: "Acme",
        title: "React Engineer",
        url: "https://example.com/jobs/react",
      },
      lifecyclePath,
    );

    expect(Object.keys(next.applied)).toHaveLength(0);
    expect(Object.keys(next.dismissed)).toHaveLength(1);
    expect(Object.keys(next.expired)).toHaveLength(0);
  });

  it("marks expired and removes prior dismissed entry", () => {
    const dir = makeTempDir();
    const lifecyclePath = join(dir, "applied-jobs.json");
    const dedupeKey = "url::https://example.com/jobs/react";

    markJobDismissed(
      {
        dedupeKey,
        company: "Acme",
        title: "React Engineer",
        url: "https://example.com/jobs/react",
      },
      lifecyclePath,
    );

    const next = markJobExpired(
      {
        dedupeKey,
        company: "Acme",
        title: "React Engineer",
        url: "https://example.com/jobs/react",
      },
      lifecyclePath,
    );

    expect(Object.keys(next.dismissed)).toHaveLength(0);
    expect(Object.keys(next.expired)).toHaveLength(1);
  });
});

describe("linkedin discovery state", () => {
  it("accepts unversioned lastRunAt shape", () => {
    const migrated = migrateLinkedInDiscoveryState({ lastRunAt: "2026-07-01T00:00:00.000Z" });
    expect(migrated).toEqual({ version: 1, lastRunAt: "2026-07-01T00:00:00.000Z" });
  });

  it("round-trips versioned state at explicit path", () => {
    const dir = makeTempDir();
    const statePath = join(dir, "linkedin-discovery-state.json");

    saveLinkedInDiscoveryState({ version: 1, lastRunAt: null }, statePath);
    const raw = JSON.parse(readFileSync(statePath, "utf8"));
    expect(raw.version).toBe(1);

    const loaded = loadLinkedInDiscoveryState(statePath);
    expect(loaded.lastRunAt).toBeNull();
  });

  it("rejects unsupported linkedin state versions", () => {
    expect(() => migrateLinkedInDiscoveryState({ version: 9, lastRunAt: null })).toThrow(
      UnsupportedStateVersionError,
    );
  });
});

describe("corrupt state handling", () => {
  it("throws on invalid lifecycle JSON shape", () => {
    expect(() => migrateJobLifecycleState({ version: 2, applied: "nope" })).toThrow();
  });
});
