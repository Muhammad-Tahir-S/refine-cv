import { describe, expect, it } from "vitest";
import {
  mergeCommitsBySha,
  mergePullRequestsByNumber,
  sortCommits,
  sortPullRequests,
} from "../../src/lib/github/merge.ts";

describe("github merge helpers", () => {
  it("dedupes and updates commits by SHA with deterministic ordering", () => {
    const prior = [
      {
        sha: "b",
        subject: "Old title",
        date: "2026-07-02T10:00:00Z",
        author: "Dev",
      },
      {
        sha: "a",
        subject: "First",
        date: "2026-07-03T10:00:00Z",
        author: "Dev",
      },
    ];
    const fetched = [
      {
        sha: "b",
        subject: "New title",
        date: "2026-07-02T10:00:00Z",
        author: "Dev",
      },
      {
        sha: "c",
        subject: "Third",
        date: "2026-07-01T10:00:00Z",
        author: "Dev",
      },
    ];

    const result = mergeCommitsBySha(prior, fetched);
    expect(result.added).toEqual(["c"]);
    expect(result.updated).toEqual(["b"]);
    expect(result.merged.map((c) => c.sha)).toEqual(["a", "b", "c"]);
    expect(sortCommits(result.merged).map((c) => c.sha)).toEqual(["a", "b", "c"]);
  });

  it("dedupes pull requests by number", () => {
    const prior = [
      {
        number: 2,
        title: "Old",
        state: "open",
        created_at: "2026-06-02T10:00:00Z",
        merged_at: "",
        labels: "",
      },
    ];
    const fetched = [
      {
        number: 2,
        title: "Updated",
        state: "closed",
        created_at: "2026-06-02T10:00:00Z",
        merged_at: "2026-06-03T10:00:00Z",
        labels: "bug",
      },
      {
        number: 1,
        title: "First",
        state: "merged",
        created_at: "2026-06-01T10:00:00Z",
        merged_at: "2026-06-01T12:00:00Z",
        labels: "",
      },
    ];

    const result = mergePullRequestsByNumber(prior, fetched);
    expect(result.added).toEqual([1]);
    expect(result.updated).toEqual([2]);
    expect(sortPullRequests(result.merged).map((p) => p.number)).toEqual([2, 1]);
  });
});
