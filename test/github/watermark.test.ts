import { describe, expect, it } from "vitest";
import {
  buildCompletenessFlags,
  computeIncrementalSince,
} from "../../src/lib/github/watermark.ts";

describe("github watermark overlap", () => {
  it("subtracts overlap from lastIndexedAt for incremental since", () => {
    const since = computeIncrementalSince("2026-07-20T12:00:00.000Z", 3600);
    expect(since).toBe("2026-07-20T11:00:00.000Z");
  });

  it("returns undefined when no prior watermark exists", () => {
    expect(computeIncrementalSince(undefined, 3600)).toBeUndefined();
  });
});

describe("github completeness flags", () => {
  it("marks capped first-run incomplete even when the limit was not hit", () => {
    const flags = buildCompletenessFlags({
      fetchMode: "first-run",
      commitLimit: 100,
      prLimit: 50,
      commitsFetchedThisRun: 12,
      pullRequestsFetchedThisRun: 3,
      includePullRequests: true,
      priorCommitsHistoryComplete: false,
      priorPullRequestsHistoryComplete: false,
    });

    expect(flags.commitsHistoryComplete).toBe(false);
    expect(flags.pullRequestsHistoryComplete).toBe(false);
    expect(flags.commitsTruncatedThisRun).toBe(false);
    expect(flags.pullRequestsTruncatedThisRun).toBe(false);
  });

  it("marks uncapped first-run complete when nothing truncated", () => {
    const flags = buildCompletenessFlags({
      fetchMode: "first-run",
      commitLimit: 0,
      prLimit: 0,
      commitsFetchedThisRun: 12,
      pullRequestsFetchedThisRun: 3,
      includePullRequests: true,
      priorCommitsHistoryComplete: false,
      priorPullRequestsHistoryComplete: false,
    });

    expect(flags.commitsHistoryComplete).toBe(true);
    expect(flags.pullRequestsHistoryComplete).toBe(true);
  });

  it("clears prior incomplete flags after an uncapped first-run repair", () => {
    const flags = buildCompletenessFlags({
      fetchMode: "first-run",
      commitLimit: 0,
      prLimit: 0,
      commitsFetchedThisRun: 50,
      pullRequestsFetchedThisRun: 4,
      includePullRequests: true,
      priorCommitsHistoryComplete: false,
      priorPullRequestsHistoryComplete: false,
    });

    expect(flags.commitsHistoryComplete).toBe(true);
    expect(flags.pullRequestsHistoryComplete).toBe(true);
  });
});
