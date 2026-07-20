import { inferThemes } from "./themes.js";
import type {
  CommitSample,
  GithubIndexAggregate,
  PrSample,
  RepoSnapshot,
} from "./schema.js";

export function mergeRepoLanguages(
  repos: RepoSnapshot[],
): Record<string, number> {
  const aggregate: Record<string, number> = {};
  for (const repo of repos) {
    for (const [language, bytes] of Object.entries(repo.languages)) {
      aggregate[language] = (aggregate[language] ?? 0) + bytes;
    }
  }
  return aggregate;
}

export function evidenceText(commits: CommitSample[], pullRequests: PrSample[]): string {
  const lines = commits.map((c) => c.subject);
  for (const pr of pullRequests) {
    lines.push(pr.title);
  }
  return lines.join("\n");
}

export function computeRepoThemes(
  commits: CommitSample[],
  pullRequests: PrSample[],
): string[] {
  return inferThemes(evidenceText(commits, pullRequests));
}

export function computeAggregate(repos: RepoSnapshot[]): GithubIndexAggregate {
  let totalCommits = 0;
  let totalPullRequests = 0;
  for (const repo of repos) {
    totalCommits += repo.commits.length;
    totalPullRequests += repo.pullRequests.length;
  }

  return {
    languages: mergeRepoLanguages(repos),
    repoCount: repos.length,
    totalCommits,
    totalPullRequests,
  };
}

export function sortRepoSnapshots(repos: RepoSnapshot[]): RepoSnapshot[] {
  return [...repos].sort((a, b) => a.repo.localeCompare(b.repo));
}
