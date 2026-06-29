import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { z } from "zod";
import { paths } from "./paths.js";

const GitHubReposConfigSchema = z.object({
  githubUsername: z.string().optional(),
  repos: z.array(z.string()),
  /** 0 = no limit (full history). Applies to first run and incremental. */
  maxCommitsPerRepo: z.number().int().nonnegative().default(0),
  /** @deprecated Use maxCommitsPerRepo. Kept for backward compatibility. */
  maxCommitsPerRepoFirstRun: z.number().int().nonnegative().optional(),
  /** 0 = no limit (all your PRs: open, closed, merged). */
  maxPullRequestsPerRepo: z.number().int().nonnegative().default(0),
  includePullRequests: z.boolean().default(true),
  indexOnlyMyCommits: z.boolean().default(true),
  commitAuthorNames: z.array(z.string()).optional(),
  _comment: z.string().optional(),
});

export type GitHubReposConfig = z.infer<typeof GitHubReposConfigSchema>;

export function loadGitHubConfig(): GitHubReposConfig {
  if (!existsSync(paths.config)) {
    throw new Error(`Missing config file: ${paths.config}`);
  }
  const raw = JSON.parse(readFileSync(paths.config, "utf8")) as unknown;
  return GitHubReposConfigSchema.parse(raw);
}

const IndexStateSchema = z.object({
  version: z.number(),
  lastFullIndexAt: z.string().nullable(),
  repos: z.record(
    z.string(),
    z.object({
      lastIndexedAt: z.string(),
      latestCommitSha: z.string().optional(),
    }),
  ),
});

export type IndexState = z.infer<typeof IndexStateSchema>;

export function loadIndexState(): IndexState {
  if (!existsSync(paths.indexState)) {
    return { version: 1, lastFullIndexAt: null, repos: {} };
  }
  return IndexStateSchema.parse(
    JSON.parse(readFileSync(paths.indexState, "utf8")),
  );
}

export function saveIndexState(state: IndexState): void {
  writeFileSync(paths.indexState, `${JSON.stringify(state, null, 2)}\n`);
}
