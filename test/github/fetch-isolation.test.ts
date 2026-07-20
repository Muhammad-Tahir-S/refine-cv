import { describe, expect, it, vi } from "vitest";
import { fetchRepoOutcomesWithIsolation } from "../../src/lib/github/index-repos.ts";
import { zeroChangeRepoOutcome } from "../../src/lib/github/refresh-run.ts";

describe("per-repo GitHub fetch isolation", () => {
  it("converts a thrown middle-repo error and continues later repos", async () => {
    const visited: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const outcomes = await fetchRepoOutcomesWithIsolation(
      ["org/first", "org/middle", "org/last"],
      async (repo) => {
        visited.push(repo);
        if (repo === "org/middle") {
          throw new Error("pagination failed");
        }
        return zeroChangeRepoOutcome(repo, "incremental");
      },
    );

    expect(visited).toEqual(["org/first", "org/middle", "org/last"]);
    expect(outcomes.map((outcome) => outcome.ok)).toEqual([true, false, true]);
    expect(outcomes[1]).toEqual({
      ok: false,
      repo: "org/middle",
      error: "pagination failed",
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("org/middle"),
    );
    warn.mockRestore();
  });
});
