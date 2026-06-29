import { Octokit } from "@octokit/rest";
import { graphql } from "@octokit/graphql";
import { getGitHubToken } from "../auth.js";

export function createOctokit(): Octokit {
  return new Octokit({ auth: getGitHubToken() });
}

export function createGraphql() {
  const token = getGitHubToken();
  return graphql.defaults({
    headers: { authorization: `token ${token}` },
  });
}

export async function paginate<T>(
  fetchPage: (page: number) => Promise<T[]>,
  maxItems = 0,
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  while (true) {
    const batch = await fetchPage(page);
    if (batch.length === 0) break;
    for (const item of batch) {
      out.push(item);
      if (maxItems > 0 && out.length >= maxItems) return out;
    }
    if (batch.length < 100) break;
    page += 1;
  }
  return out;
}
