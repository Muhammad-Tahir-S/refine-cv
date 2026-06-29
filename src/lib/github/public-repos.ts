import type { ContributedNode } from "./list-candidates-types.js";

const USER_AGENT = "refine-cv";

/**
 * Unauthenticated GitHub API — public repos only.
 */
export async function fetchPublicOwnedRepos(
  login: string,
): Promise<ContributedNode[]> {
  const nodes: ContributedNode[] = [];
  let page = 1;

  while (page <= 10) {
    const url = `https://api.github.com/users/${login}/repos?per_page=100&page=${page}&sort=pushed`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as Array<{
      full_name: string;
      pushed_at: string | null;
      private: boolean;
      fork: boolean;
      description: string | null;
      language: string | null;
    }>;
    if (data.length === 0) break;

    for (const r of data) {
      nodes.push({
        nameWithOwner: r.full_name,
        pushedAt: r.pushed_at,
        isPrivate: r.private,
        isFork: r.fork,
        description: r.description,
        primaryLanguage: r.language ? { name: r.language } : null,
      });
    }
    if (data.length < 100) break;
    page += 1;
  }

  return nodes;
}
