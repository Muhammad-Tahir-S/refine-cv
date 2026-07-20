import { mkdirSync } from "node:fs";
import type { Octokit } from "@octokit/rest";
import {
  loadGitHubConfig,
  loadIndexState,
  type GitHubReposConfig,
} from "../config.js";
import { paths } from "../paths.js";
import { createOctokit } from "./octokit.js";
import {
  isOwnCommit,
  isOwnPullRequest,
  resolveCommitAuthorIdentity,
  type CommitAuthorIdentity,
} from "./commit-author.js";
import { buildGithubSummaryMarkdown } from "./summary.js";
import {
  buildGithubRefreshResult,
  computeRepoFetchSince,
  type RepoFetchOutcome,
} from "./refresh-run.js";
import { dedupeFetchedCommitsBySha } from "./merge.js";
import type { CommitSample, PrSample } from "./schema.js";
import {
  defaultGithubArtifactPaths,
  loadPriorGithubIndex,
  publishGithubRefresh,
  readRefreshLog,
} from "./persistence.js";
import {
  appendRefreshLogRow,
  refreshLogStatus,
} from "./refresh-log.js";

export type { CommitSample, PrSample, RepoSnapshot } from "./schema.js";

function commitLimit(config: GitHubReposConfig): number {
  return config.maxCommitsPerRepo ?? config.maxCommitsPerRepoFirstRun ?? 0;
}

function prLimit(config: GitHubReposConfig): number {
  return config.maxPullRequestsPerRepo ?? 0;
}

function toCommitSample(
  c: Awaited<ReturnType<Octokit["repos"]["listCommits"]>>["data"][number],
): CommitSample {
  return {
    sha: c.sha,
    subject: (c.commit.message ?? "").split("\n")[0] ?? "",
    date: c.commit.author?.date ?? c.commit.committer?.date ?? "",
    author: c.commit.author?.name ?? c.author?.login ?? "",
  };
}

async function fetchCommitsByLogin(
  octokit: Octokit,
  owner: string,
  name: string,
  defaultBranch: string,
  login: string,
  since: string | undefined,
  seen: Set<string>,
  own: Awaited<ReturnType<Octokit["repos"]["listCommits"]>>["data"],
  maxOwn: number,
): Promise<boolean> {
  let page = 1;
  let truncated = false;
  while (true) {
    const { data } = await octokit.repos.listCommits({
      owner,
      repo: name,
      sha: defaultBranch,
      author: login,
      since: since || undefined,
      per_page: 100,
      page,
    });
    if (data.length === 0) break;

    for (const c of data) {
      if (seen.has(c.sha)) continue;
      seen.add(c.sha);
      own.push(c);
      if (maxOwn > 0 && own.length >= maxOwn) {
        return true;
      }
    }

    if (data.length < 100) break;
    page += 1;
  }
  return truncated;
}

async function fetchCommitsByNameScan(
  octokit: Octokit,
  owner: string,
  name: string,
  defaultBranch: string,
  identity: CommitAuthorIdentity,
  since: string | undefined,
  seen: Set<string>,
  own: Awaited<ReturnType<Octokit["repos"]["listCommits"]>>["data"],
  maxOwn: number,
): Promise<boolean> {
  let page = 1;
  while (true) {
    const { data } = await octokit.repos.listCommits({
      owner,
      repo: name,
      sha: defaultBranch,
      since: since || undefined,
      per_page: 100,
      page,
    });
    if (data.length === 0) break;

    for (const c of data) {
      if (!isOwnCommit(c, identity) || seen.has(c.sha)) continue;
      seen.add(c.sha);
      own.push(c);
      if (maxOwn > 0 && own.length >= maxOwn) {
        return true;
      }
    }

    if (data.length < 100) break;
    page += 1;
  }
  return false;
}

async function fetchOwnCommits(
  octokit: Octokit,
  owner: string,
  name: string,
  defaultBranch: string,
  identity: CommitAuthorIdentity,
  since: string | undefined,
  maxOwn: number,
  filterToSelf: boolean,
): Promise<{
  commits: CommitSample[];
  commitsFetchedThisRun: number;
  truncated: boolean;
}> {
  const seen = new Set<string>();
  const own: Awaited<ReturnType<Octokit["repos"]["listCommits"]>>["data"] = [];
  let truncated = false;

  if (filterToSelf) {
    for (const login of identity.githubLogins) {
      truncated =
        (await fetchCommitsByLogin(
          octokit,
          owner,
          name,
          defaultBranch,
          login,
          since,
          seen,
          own,
          maxOwn,
        )) || truncated;
      if (maxOwn > 0 && own.length >= maxOwn) break;
    }

    if (own.length === 0) {
      truncated =
        (await fetchCommitsByNameScan(
          octokit,
          owner,
          name,
          defaultBranch,
          identity,
          since,
          seen,
          own,
          maxOwn,
        )) || truncated;
    }
  } else {
    truncated = await fetchCommitsByNameScan(
      octokit,
      owner,
      name,
      defaultBranch,
      identity,
      since,
      seen,
      own,
      maxOwn,
    );
  }

  const samples = dedupeFetchedCommitsBySha(own.map(toCommitSample));
  return {
    commits: samples,
    commitsFetchedThisRun: own.length,
    truncated,
  };
}

async function fetchOwnPullRequests(
  octokit: Octokit,
  owner: string,
  name: string,
  identity: CommitAuthorIdentity,
  filterToSelf: boolean,
  maxPrs: number,
): Promise<{ pullRequests: PrSample[]; truncated: boolean }> {
  const own: Awaited<ReturnType<Octokit["pulls"]["list"]>>["data"] = [];
  let page = 1;
  let truncated = false;

  while (true) {
    const { data } = await octokit.pulls.list({
      owner,
      repo: name,
      state: "all",
      sort: "created",
      direction: "desc",
      per_page: 100,
      page,
    });
    if (data.length === 0) break;

    for (const pr of data) {
      if (filterToSelf && !isOwnPullRequest(pr, identity)) continue;
      own.push(pr);
      if (maxPrs > 0 && own.length >= maxPrs) {
        truncated = true;
        return {
          pullRequests: own.map((pr) => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            created_at: pr.created_at,
            merged_at: pr.merged_at ?? "",
            labels: pr.labels
              .map((l) => (typeof l === "string" ? l : l.name ?? ""))
              .join(", "),
          })),
          truncated,
        };
      }
    }

    if (data.length < 100) break;
    page += 1;
  }

  return {
    pullRequests: own.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      created_at: pr.created_at,
      merged_at: pr.merged_at ?? "",
      labels: pr.labels
        .map((l) => (typeof l === "string" ? l : l.name ?? ""))
        .join(", "),
    })),
    truncated: false,
  };
}

export interface IndexGithubDeps {
  loadConfig?: typeof loadGitHubConfig;
  loadIndexState?: typeof loadIndexState;
  createOctokit?: typeof createOctokit;
  resolveIdentity?: typeof resolveCommitAuthorIdentity;
  fetchRepo?: typeof fetchOneRepo;
  loadPriorIndex?: typeof loadPriorGithubIndex;
  publishRefresh?: typeof publishGithubRefresh;
  readLog?: typeof readRefreshLog;
  artifactPaths?: ReturnType<typeof defaultGithubArtifactPaths>;
}

export async function fetchRepoOutcomesWithIsolation(
  repos: string[],
  fetchRepo: (repo: string) => Promise<RepoFetchOutcome>,
): Promise<RepoFetchOutcome[]> {
  const outcomes: RepoFetchOutcome[] = [];
  for (const repo of repos) {
    try {
      outcomes.push(await fetchRepo(repo));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown GitHub API failure";
      console.warn(`warn: failed to refresh ${repo} — ${message}`);
      outcomes.push({ ok: false, repo, error: message });
    }
  }
  return outcomes;
}

async function fetchOneRepo(
  octokit: Octokit,
  repo: string,
  config: GitHubReposConfig,
  identity: CommitAuthorIdentity,
  since: string | undefined,
): Promise<RepoFetchOutcome> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    return { ok: false, repo, error: `invalid repo slug "${repo}"` };
  }

  const filterToSelf = config.indexOnlyMyCommits !== false;
  const fetchMode = since ? "incremental" : "first-run";

  let meta: Awaited<ReturnType<Octokit["repos"]["get"]>>["data"];
  try {
    ({ data: meta } = await octokit.repos.get({ owner, repo: name }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "cannot access repository";
    console.warn(`warn: cannot access ${repo} — ${message}`);
    return { ok: false, repo, error: message };
  }

  const defaultBranch = meta.default_branch;
  const maxOwn = commitLimit(config);
  const maxPrs = prLimit(config);

  let languages: Record<string, number> = {};
  try {
    const { data: langs } = await octokit.repos.listLanguages({ owner, repo: name });
    languages = langs as Record<string, number>;
  } catch {
    /* empty */
  }

  const {
    commits,
    commitsFetchedThisRun,
    truncated: commitsTruncated,
  } = await fetchOwnCommits(
    octokit,
    owner,
    name,
    defaultBranch,
    identity,
    since,
    maxOwn,
    filterToSelf,
  );

  let fetchedPullRequests: PrSample[] = [];
  let pullRequestsFetchedThisRun = 0;
  let prsTruncated = false;

  if (config.includePullRequests) {
    const prResult = await fetchOwnPullRequests(
      octokit,
      owner,
      name,
      identity,
      filterToSelf,
      maxPrs,
    );
    fetchedPullRequests = prResult.pullRequests;
    pullRequestsFetchedThisRun = prResult.pullRequests.length;
    prsTruncated = prResult.truncated;
  }

  if (filterToSelf) {
    console.log(
      `  ${repo}: fetched ${commitsFetchedThisRun} commits, ${pullRequestsFetchedThisRun} PRs this run`,
    );
  }

  return {
    ok: true,
    repo,
    fetchMode,
    description: meta.description ?? "",
    topics: meta.topics ?? [],
    defaultBranch,
    pushedAt: meta.pushed_at ?? "",
    languages,
    fetchedCommits: commits,
    fetchedPullRequests,
    commitsFetchedThisRun,
    pullRequestsFetchedThisRun,
    commitsTruncatedThisRun: commitsTruncated,
    pullRequestsTruncatedThisRun: prsTruncated,
  };
}

export async function runIndexGithub(deps: IndexGithubDeps = {}): Promise<void> {
  const loadConfig = deps.loadConfig ?? loadGitHubConfig;
  const loadState = deps.loadIndexState ?? loadIndexState;
  const octokitFactory = deps.createOctokit ?? createOctokit;
  const resolveIdentity = deps.resolveIdentity ?? resolveCommitAuthorIdentity;
  const fetchRepo = deps.fetchRepo ?? fetchOneRepo;
  const loadPriorIndex = deps.loadPriorIndex ?? loadPriorGithubIndex;
  const publishRefresh = deps.publishRefresh ?? publishGithubRefresh;
  const readLog = deps.readLog ?? readRefreshLog;
  const artifactPaths =
    deps.artifactPaths ?? defaultGithubArtifactPaths(paths.profile);

  const config = loadConfig();
  if (config.repos.length === 0) {
    throw new Error(
      "No repos in config/github-repos.json — run `pnpm list-repos` and add selections.",
    );
  }

  mkdirSync(paths.profile, { recursive: true });
  const octokit = octokitFactory();
  const identity = await resolveIdentity(
    octokit,
    config.githubUsername,
    config.commitAuthorNames ?? [],
  );
  const maxCommits = commitLimit(config);
  const maxPrs = prLimit(config);
  console.log(
    `Indexing your work history (logins: ${identity.githubLogins.join(", ") || "—"}; names: ${identity.commitNames.join(", ")})`,
  );
  console.log(
    `Limits: commits=${maxCommits === 0 ? "none" : maxCommits}, PRs=${maxPrs === 0 ? "none" : maxPrs}\n`,
  );
  if (maxCommits > 0 || maxPrs > 0) {
    console.warn(
      "warn: capped GitHub retrieval cannot repair incomplete history. Set maxCommitsPerRepo and maxPullRequestsPerRepo to 0 for a complete rebuild.",
    );
  }

  const priorIndexState = loadState();
  const priorIndex = loadPriorIndex(
    artifactPaths.githubIndex,
    artifactPaths.indexState,
  );
  const now = new Date().toISOString();

  const priorByRepo = new Map(
    (priorIndex?.repos ?? []).map((repo) => [repo.repo, repo]),
  );

  const outcomes = await fetchRepoOutcomesWithIsolation(
    config.repos,
    async (repo) => {
    console.log(`Indexing ${repo}...`);
    const since = computeRepoFetchSince(
      priorByRepo.get(repo),
      priorIndexState,
      repo,
    );
      return fetchRepo(octokit, repo, config, identity, since);
    },
  );

  const refresh = buildGithubRefreshResult({
    runAt: now,
    selectedRepos: config.repos,
    authorIdentity: identity,
    priorIndex,
    priorIndexState,
    outcomes,
    commitLimit: maxCommits,
    prLimit: maxPrs,
    includePullRequests: config.includePullRequests,
  });

  const summaryMarkdown = buildGithubSummaryMarkdown(
    now,
    refresh.index.repos,
    refresh.index.aggregate.languages,
    {
      totalCommits: refresh.index.aggregate.totalCommits,
      totalPullRequests: refresh.index.aggregate.totalPullRequests,
      repoCount: refresh.index.aggregate.repoCount,
    },
    refresh.delta,
  );

  const existingLog = readLog(artifactPaths.refreshLog);
  const refreshLogMarkdown = appendRefreshLogRow(
    existingLog,
    refresh.delta,
    refreshLogStatus(refresh.delta),
  );

  publishRefresh({
    paths: artifactPaths,
    index: refresh.index,
    summaryMarkdown,
    delta: refresh.delta,
    refreshLogMarkdown,
    indexState: refresh.indexState,
  });

  console.log("\nDone. Wrote:");
  console.log(`  ${artifactPaths.githubIndex}`);
  console.log(`  ${artifactPaths.githubSummary}`);
  console.log(`  ${artifactPaths.githubDelta}`);
  console.log(
    `  Totals (complete snapshot): ${refresh.index.aggregate.totalCommits} your commits, ${refresh.index.aggregate.totalPullRequests} your PRs across ${refresh.index.aggregate.repoCount} repos`,
  );
  console.log(
    `  Delta this run: +${refresh.delta.aggregateDelta.commitsAdded} commits, +${refresh.delta.aggregateDelta.pullRequestsAdded} PRs`,
  );
}

export { fetchOneRepo as fetchOneRepoForTest };
