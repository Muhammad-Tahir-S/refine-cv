import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  atomicWriteFile,
  atomicWriteJson,
} from "../../src/lib/jobs/persistence.ts";
import {
  defaultGithubArtifactPaths,
  loadPriorGithubIndex,
  publishGithubRefresh,
} from "../../src/lib/github/persistence.ts";
import { GITHUB_INDEX_VERSION } from "../../src/lib/github/schema.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixture() {
  const profileDir = mkdtempSync(join(tmpdir(), "github-durability-"));
  dirs.push(profileDir);
  const paths = defaultGithubArtifactPaths(profileDir);
  const priorIndexBytes = '{"prior":"index"}\n';
  const priorStateBytes =
    '{"version":1,"lastFullIndexAt":"2026-07-19T00:00:00Z","repos":{}}\n';
  writeFileSync(paths.githubIndex, priorIndexBytes);
  writeFileSync(paths.indexState, priorStateBytes);

  return {
    paths,
    priorIndexBytes,
    priorStateBytes,
    index: {
      version: GITHUB_INDEX_VERSION as const,
      snapshotAt: "2026-07-20T00:00:00Z",
      indexScope: "author-full-history" as const,
      authorIdentity: { githubLogins: [], commitNames: [] },
      selectedRepos: [],
      repos: [],
      aggregate: {
        languages: {},
        repoCount: 0,
        totalCommits: 0,
        totalPullRequests: 0,
      },
    },
    delta: {
      version: 1 as const,
      runAt: "2026-07-20T00:00:00Z",
      reposAttempted: [],
      reposSucceeded: [],
      reposFailed: [],
      perRepo: {},
      aggregateDelta: {
        commitsAdded: 0,
        commitsUpdated: 0,
        pullRequestsAdded: 0,
        pullRequestsUpdated: 0,
      },
      diagnostics: { watermarkOverlapSeconds: 3600, warnings: [] },
    },
    state: {
      version: 1 as const,
      lastFullIndexAt: "2026-07-20T00:00:00Z",
      repos: {},
    },
  };
}

describe("GitHub publication transaction ordering", () => {
  for (const failurePosition of [
    "github-summary.md",
    "github-delta.json",
    "refresh-log.md",
    "github-index.json",
    "index-state.json",
  ]) {
    it(`keeps the commit marker safe when ${failurePosition} fails`, () => {
      const f = fixture();
      const calls: string[] = [];
      const fail = (targetPath: string): void => {
        calls.push(targetPath);
        if (targetPath.endsWith(failurePosition)) {
          throw new Error(`failed ${failurePosition}`);
        }
      };

      expect(() =>
        publishGithubRefresh({
          paths: f.paths,
          index: f.index,
          summaryMarkdown: "# summary\n",
          delta: f.delta,
          refreshLogMarkdown: "# log\n",
          indexState: f.state,
          writeAtomicFile: (targetPath, content, options) => {
            fail(targetPath);
            atomicWriteFile(targetPath, content, options);
          },
          writeAtomicJson: (targetPath, value, options) => {
            fail(targetPath);
            atomicWriteJson(targetPath, value, options);
          },
        }),
      ).toThrow(`failed ${failurePosition}`);

      expect(readFileSync(f.paths.indexState, "utf8")).toBe(f.priorStateBytes);
      if (failurePosition !== "index-state.json") {
        expect(readFileSync(f.paths.githubIndex, "utf8")).toBe(
          f.priorIndexBytes,
        );
      } else {
        expect(readFileSync(f.paths.githubIndex, "utf8")).not.toBe(
          f.priorIndexBytes,
        );
      }

      const names = calls.map((path) => path.slice(path.lastIndexOf("/") + 1));
      expect(names).toEqual(
        [
          "github-summary.md",
          "github-delta.json",
          "refresh-log.md",
          "github-index.json",
          "index-state.json",
        ].slice(0, names.length),
      );
    });
  }

  it("preserves and reports invalid index-state instead of casting it", () => {
    const f = fixture();
    writeFileSync(
      f.paths.indexState,
      '{"version":99,"lastFullIndexAt":null,"repos":{}}\n',
    );

    expect(() =>
      loadPriorGithubIndex(f.paths.githubIndex, f.paths.indexState),
    ).toThrow(/failed schema validation/);
    expect(
      readdirSync(f.paths.profileDir).some((name) =>
        name.startsWith("index-state.json.corrupt."),
      ),
    ).toBe(true);
  });
});
