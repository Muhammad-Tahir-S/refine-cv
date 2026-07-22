import { describe, expect, it, vi } from "vitest";
import {
  isOwnCommit,
  resolveCommitAuthorIdentity,
} from "../src/lib/github/commit-author.ts";

describe("resolveCommitAuthorIdentity", () => {
  it("does not hardcode personal commit author names", async () => {
    const octokit = {
      users: {
        getAuthenticated: vi.fn().mockRejectedValue(new Error("no user scope")),
      },
    };

    const identity = await resolveCommitAuthorIdentity(
      octokit as never,
      "someone",
      [],
    );

    expect(identity.githubLogins).toEqual(["someone"]);
    expect(identity.commitNames).toEqual([]);
  });

  it("uses config commitAuthorNames and authenticated profile name", async () => {
    const octokit = {
      users: {
        getAuthenticated: vi.fn().mockResolvedValue({
          data: { login: "octocat", name: "The Octocat" },
        }),
      },
    };

    const identity = await resolveCommitAuthorIdentity(
      octokit as never,
      "someone",
      ["Alex Example"],
    );

    expect(identity.githubLogins.sort()).toEqual(["octocat", "someone"]);
    expect(identity.commitNames.sort()).toEqual(["Alex Example", "The Octocat"]);
  });

  it("matches commits by configured names only", async () => {
    const identity = await resolveCommitAuthorIdentity(
      {
        users: {
          getAuthenticated: vi.fn().mockRejectedValue(new Error("nope")),
        },
      } as never,
      "someone",
      ["Alex Example"],
    );

    expect(
      isOwnCommit(
        {
          author: { login: null },
          commit: {
            author: { name: "Alex Example", email: "a@example.com" },
            committer: { name: "Alex Example", email: "a@example.com" },
          },
        },
        identity,
      ),
    ).toBe(true);

    expect(
      isOwnCommit(
        {
          author: { login: null },
          commit: {
            author: { name: "Unrelated Person", email: "u@example.com" },
            committer: { name: "Unrelated Person", email: "u@example.com" },
          },
        },
        identity,
      ),
    ).toBe(false);
  });
});
