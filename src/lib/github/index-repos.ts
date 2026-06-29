import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Octokit } from "@octokit/rest";
import {
  loadGitHubConfig,
  loadIndexState,
  saveIndexState,
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
import { inferThemes } from "./themes.js";
import { buildGithubSummaryMarkdown } from "./summary.js";

export interface CommitSample {
  sha: string;
  subject: string;
  date: string;
  author: string;
}

export interface PrSample {
  number: number;
  title: string;
  state: string;
  created_at: string;
  merged_at: string;
  labels: string;
}

export interface RepoIndexEntry {
  repo: string;
  mode: "first-run" | "incremental";
  description: string;
  topics: string[];
  defaultBranch: string;
  pushedAt: string;
  languages: Record<string, number>;
  commitCountThisRun: number;
  /** Full commit history for this run (your commits only). */
  commits: CommitSample[];
  /** @deprecated Preview subset; use `commits` for full history. */
  sampleCommits: CommitSample[];
  pullRequests: PrSample[];
  inferredThemes: string[];
  watermark: { since: string; latestCommitSha: string };
}

function commitLimit(config: GitHubReposConfig): number {
  return config.maxCommitsPerRepo ?? config.maxCommitsPerRepoFirstRun ?? 0;
}

function prLimit(config: GitHubReposConfig): number {
  return config.maxPullRequestsPerRepo ?? 0;
}

function mergeLanguages(
  agg: Record<string, number>,
  lang: Record<string, number>,
): Record<string, number> {
  const out = { ...agg };
  for (const [k, v] of Object.entries(lang)) {
    out[k] = (out[k] ?? 0) + v;
  }
  return out;
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
): Promise<void> {
  let page = 1;
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
      if (maxOwn > 0 && own.length >= maxOwn) return;
    }

    if (data.length < 100) break;
    page += 1;
  }
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
): Promise<void> {
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
      if (maxOwn > 0 && own.length >= maxOwn) return;
    }

    if (data.length < 100) break;
    page += 1;
  }
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
): Promise<{ commits: Awaited<ReturnType<Octokit["repos"]["listCommits"]>>["data"]; latestSha: string }> {
  const seen = new Set<string>();
  const own: Awaited<ReturnType<Octokit["repos"]["listCommits"]>>["data"] = [];

  if (filterToSelf) {
    for (const login of identity.githubLogins) {
      await fetchCommitsByLogin(
        octokit,
        owner,
        name,
        defaultBranch,
        login,
        since,
        seen,
        own,
        maxOwn,
      );
      if (maxOwn > 0 && own.length >= maxOwn) {
        return { commits: own, latestSha: own[0]?.sha ?? "" };
      }
    }

    if (own.length === 0) {
      await fetchCommitsByNameScan(
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
  } else {
    await fetchCommitsByNameScan(
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

  return { commits: own, latestSha: own[0]?.sha ?? "" };
}

async function fetchOwnPullRequests(
  octokit: Octokit,
  owner: string,
  name: string,
  identity: CommitAuthorIdentity,
  filterToSelf: boolean,
  maxPrs: number,
): Promise<Awaited<ReturnType<Octokit["pulls"]["list"]>>["data"]> {
  const own: Awaited<ReturnType<Octokit["pulls"]["list"]>>["data"] = [];
  let page = 1;

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
      if (maxPrs > 0 && own.length >= maxPrs) return own;
    }

    if (data.length < 100) break;
    page += 1;
  }

  return own;
}

async function indexOneRepo(
  octokit: Octokit,
  repo: string,
  config: GitHubReposConfig,
  identity: CommitAuthorIdentity,
  since: string | undefined,
): Promise<RepoIndexEntry | null> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    console.warn(`warn: invalid repo slug "${repo}" — skipped`);
    return null;
  }

  const filterToSelf = config.indexOnlyMyCommits !== false;

  let meta: Awaited<ReturnType<Octokit["repos"]["get"]>>["data"];
  try {
    ({ data: meta } = await octokit.repos.get({ owner, repo: name }));
  } catch {
    console.warn(`warn: cannot access ${repo} — skipped (check token permissions)`);
    return null;
  }

  const mode = since ? "incremental" : "first-run";
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

  const { commits: rawCommits, latestSha } = await fetchOwnCommits(
    octokit,
    owner,
    name,
    defaultBranch,
    identity,
    since,
    maxOwn,
    filterToSelf,
  );

  const commits = rawCommits.map(toCommitSample);
  let allText = commits.map((c) => c.subject).join("\n");

  const pullRequests: PrSample[] = [];
  if (config.includePullRequests) {
    const prs = await fetchOwnPullRequests(
      octokit,
      owner,
      name,
      identity,
      filterToSelf,
      maxPrs,
    );

    for (const pr of prs) {
      pullRequests.push({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        created_at: pr.created_at,
        merged_at: pr.merged_at ?? "",
        labels: pr.labels
          .map((l) => (typeof l === "string" ? l : l.name ?? ""))
          .join(", "),
      });
      allText += `\n${pr.title}`;
    }
  }

  if (filterToSelf) {
    console.log(
      `  ${repo}: ${commits.length} your commits, ${pullRequests.length} your PRs`,
    );
  }

  return {
    repo,
    mode,
    description: meta.description ?? "",
    topics: meta.topics ?? [],
    defaultBranch,
    pushedAt: meta.pushed_at ?? "",
    languages,
    commitCountThisRun: commits.length,
    commits,
    sampleCommits: commits.slice(0, 25),
    pullRequests,
    inferredThemes: inferThemes(allText),
    watermark: { since: since ?? "", latestCommitSha: latestSha },
  };
}

function appendRefreshLog(
  timestamp: string,
  repos: string[],
  totalCommits: number,
  totalPrs: number,
): void {
  const header = `# GitHub profile refresh log

| Timestamp (UTC) | Mode | Repos touched | Delta summary |
|-----------------|------|---------------|----------------|
`;
  if (!existsSync(paths.refreshLog)) {
    writeFileSync(paths.refreshLog, header);
  }
  const row = `| ${timestamp} | index | ${repos.join(" ")} | your_commits=${totalCommits} your_prs=${totalPrs} |\n`;
  writeFileSync(paths.refreshLog, readFileSync(paths.refreshLog, "utf8") + row);
}

export async function runIndexGithub(): Promise<void> {
  const config = loadGitHubConfig();
  if (config.repos.length === 0) {
    throw new Error(
      "No repos in config/github-repos.json — run `pnpm list-repos` and add selections.",
    );
  }

  mkdirSync(paths.profile, { recursive: true });
  const octokit = createOctokit();
  const identity = await resolveCommitAuthorIdentity(
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

  const state = loadIndexState();
  const now = new Date().toISOString();

  const entries: RepoIndexEntry[] = [];
  let aggregateLanguages: Record<string, number> = {};
  let totalCommits = 0;
  let totalPrs = 0;

  for (const repo of config.repos) {
    console.log(`Indexing ${repo}...`);
    const since = state.repos[repo]?.lastIndexedAt;
    const entry = await indexOneRepo(octokit, repo, config, identity, since);
    if (!entry) continue;

    entries.push(entry);
    if (entry.commitCountThisRun > 0 || entry.pullRequests.length > 0) {
      aggregateLanguages = mergeLanguages(aggregateLanguages, entry.languages);
    }
    totalCommits += entry.commitCountThisRun;
    totalPrs += entry.pullRequests.length;

    state.repos[repo] = {
      lastIndexedAt: now,
      latestCommitSha: entry.watermark.latestCommitSha,
    };
  }

  state.lastFullIndexAt = now;
  saveIndexState(state);

  const indexDoc = {
    version: 3,
    generatedAt: now,
    indexScope: "author-full-history",
    authorIdentity: identity,
    repos: entries,
    aggregate: {
      languages: aggregateLanguages,
      repoCount: entries.length,
      totalCommitsThisRun: totalCommits,
      totalPullRequests: totalPrs,
    },
  };

  writeFileSync(paths.githubIndex, `${JSON.stringify(indexDoc, null, 2)}\n`);
  writeFileSync(
    paths.githubSummary,
    buildGithubSummaryMarkdown(now, entries, aggregateLanguages),
  );
  appendRefreshLog(now, config.repos, totalCommits, totalPrs);

  console.log("\nDone. Wrote:");
  console.log(`  ${paths.githubIndex}`);
  console.log(`  ${paths.githubSummary}`);
  console.log(
    `  Totals: ${totalCommits} your commits, ${totalPrs} your PRs across ${entries.length} repos`,
  );
}
