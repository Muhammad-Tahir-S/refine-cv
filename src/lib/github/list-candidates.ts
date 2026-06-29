import { writeFileSync } from "node:fs";
import { loadGitHubConfig } from "../config.js";
import { paths } from "../paths.js";
import { createGraphql, createOctokit, paginate } from "./octokit.js";
import { fetchPublicOwnedRepos } from "./public-repos.js";
import type {
  ContributedNode,
  RepoCandidate,
  RepoCandidateSource,
} from "./list-candidates-types.js";

export type { RepoCandidate } from "./list-candidates-types.js";

async function fetchContributedRepos(
  login: string,
): Promise<ContributedNode[]> {
  const gql = createGraphql();
  const nodes: ContributedNode[] = [];
  let cursor: string | null = null;

  const query = `
    query($login: String!, $after: String) {
      user(login: $login) {
        repositoriesContributedTo(
          first: 100
          after: $after
          contributionTypes: [COMMIT]
          includeUserRepositories: true
        ) {
          pageInfo { hasNextPage endCursor }
          nodes {
            nameWithOwner
            pushedAt
            isPrivate
            isFork
            description
            primaryLanguage { name }
          }
        }
      }
    }
  `;

  for (;;) {
    const data: {
      user: {
        repositoriesContributedTo: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: ContributedNode[];
        };
      } | null;
    } = await gql(query, { login, after: cursor });

    const block = data.user?.repositoriesContributedTo;
    if (!block) break;
    nodes.push(...block.nodes);
    if (!block.pageInfo.hasNextPage) break;
    cursor = block.pageInfo.endCursor;
  }

  return nodes;
}

async function fetchOwnedRepos(login: string): Promise<ContributedNode[]> {
  const octokit = createOctokit();
  const repos = await paginate(async (page) => {
    const { data } = await octokit.repos.listForUser({
      username: login,
      per_page: 100,
      page,
      sort: "pushed",
    });
    return data;
  });

  return repos.map((r) => ({
    nameWithOwner: r.full_name ?? `${r.owner?.login}/${r.name}`,
    pushedAt: r.pushed_at ?? null,
    isPrivate: r.private ?? false,
    isFork: r.fork ?? false,
    description: r.description,
    primaryLanguage: r.language ? { name: r.language } : null,
  }));
}

async function fetchAccessibleRepos(): Promise<ContributedNode[]> {
  const octokit = createOctokit();
  const repos = await paginate(async (page) => {
    const { data } = await octokit.repos.listForAuthenticatedUser({
      affiliation: "owner,collaborator,organization_member",
      visibility: "all",
      per_page: 100,
      page,
      sort: "pushed",
    });
    return data;
  });

  return repos.map((r) => ({
    nameWithOwner: r.full_name ?? `${r.owner?.login}/${r.name}`,
    pushedAt: r.pushed_at ?? null,
    isPrivate: r.private ?? false,
    isFork: r.fork ?? false,
    description: r.description,
    primaryLanguage: r.language ? { name: r.language } : null,
  }));
}

function mergeCandidates(
  contributed: ContributedNode[],
  owned: ContributedNode[],
  accessible: ContributedNode[],
): RepoCandidate[] {
  const map = new Map<string, RepoCandidate>();
  const add = (nodes: ContributedNode[], source: RepoCandidateSource) => {
    for (const n of nodes) {
      const existing = map.get(n.nameWithOwner);
      const pushedAt = n.pushedAt ?? "";
      const primaryLanguage = n.primaryLanguage?.name ?? null;
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
        if (pushedAt > existing.pushedAt) existing.pushedAt = pushedAt;
      } else {
        map.set(n.nameWithOwner, {
          nameWithOwner: n.nameWithOwner,
          pushedAt,
          isPrivate: n.isPrivate,
          isFork: n.isFork,
          description: n.description ?? "",
          primaryLanguage,
          sources: [source],
        });
      }
    }
  };
  add(contributed, "contributed");
  add(owned, "owned");
  add(accessible, "accessible");
  return [...map.values()].sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
}

export async function runListRepos(options: {
  username?: string;
  years?: number;
  publicOnly?: boolean;
}): Promise<RepoCandidate[]> {
  const config = loadGitHubConfig();
  const login =
    options.username ?? config.githubUsername ?? process.env.GITHUB_USERNAME;
  if (!login) {
    throw new Error(
      "GitHub username required: set githubUsername in config/github-repos.json or pass --username",
    );
  }

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - (options.years ?? 10));

  console.log(`Fetching repos for ${login} (activity since ${cutoff.toISOString().slice(0, 10)})...`);

  let contributed: ContributedNode[] = [];
  let owned: ContributedNode[] = [];
  let accessible: ContributedNode[] = [];

  if (options.publicOnly) {
    console.warn(
      "Public-only mode: private and employer repos are not listed. Set GITHUB_TOKEN for full results.",
    );
    owned = await fetchPublicOwnedRepos(login);
  } else {
    try {
      [contributed, owned, accessible] = await Promise.all([
        fetchContributedRepos(login),
        fetchOwnedRepos(login),
        fetchAccessibleRepos(),
      ]);
    } catch (err) {
      console.warn(
        `Auth failed (${err instanceof Error ? err.message : err}). Falling back to public repos only.`,
      );
      owned = await fetchPublicOwnedRepos(login);
    }
  }

  const merged = mergeCandidates(contributed, owned, accessible).filter((r) => {
    if (!r.pushedAt) return true;
    return new Date(r.pushedAt) >= cutoff;
  });

  const incomplete =
    options.publicOnly ||
    (contributed.length === 0 &&
      accessible.length === 0 &&
      owned.length > 0 &&
      merged.every((r) => !r.isPrivate));
  const md = buildCandidatesMarkdown(login, cutoff, merged, incomplete);
  writeFileSync(paths.repoCandidates, md);

  console.log(`\nWrote ${paths.repoCandidates}`);
  console.log(`Found ${merged.length} repos. Copy selections into config/github-repos.json "repos" array.\n`);

  for (const r of merged) {
    const flags = [
      r.isPrivate ? "private" : "public",
      r.isFork ? "fork" : "",
      r.sources.join("+"),
    ]
      .filter(Boolean)
      .join(", ");
    console.log(
      `  ${r.nameWithOwner}\t${r.pushedAt.slice(0, 10)}\t${r.primaryLanguage ?? "—"}\t[${flags}]`,
    );
  }

  return merged;
}

function buildCandidatesMarkdown(
  login: string,
  cutoff: Date,
  repos: RepoCandidate[],
  incomplete: boolean,
): string {
  const lines = [
    "# GitHub repo candidates",
    "",
    `**User:** \`${login}\``,
    `**Window:** activity since ${cutoff.toISOString().slice(0, 10)} (approx. last 10 years)`,
    "",
    "Select repos to index in `config/github-repos.json`. Private repos are ingested for CV evidence only — **do not paste proprietary code** into tailored outputs (see `profile/questionnaire.md`).",
  "",
  ...(incomplete
    ? [
        "> **Note:** This list may be incomplete. Run `pnpm list-repos` with `GITHUB_TOKEN` or `gh auth login` to include private contributed repos.",
        "",
      ]
    : []),
    "",
    "| Repo | Last pushed | Language | Visibility | Sources |",
    "|------|-------------|----------|------------|---------|",
  ];

  for (const r of repos) {
    const vis = r.isPrivate ? "private" : "public";
    const fork = r.isFork ? " (fork)" : "";
    lines.push(
      `| \`${r.nameWithOwner}\`${fork} | ${r.pushedAt.slice(0, 10)} | ${r.primaryLanguage ?? "—"} | ${vis} | ${r.sources.join(", ")} |`,
    );
  }

  lines.push("", "## Suggested selections", "");
  lines.push(
    "Check repos you want indexed, then add to `config/github-repos.json`:",
  );
  lines.push("", "```json", '"repos": [', "");
  for (const r of repos.slice(0, 5)) {
    lines.push(`  "${r.nameWithOwner}",`);
  }
  lines.push('  "// add more from the table above"', "]", "```", "");

  return lines.join("\n");
}
