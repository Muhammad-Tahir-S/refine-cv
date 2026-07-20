import type { CommitSample, PrSample } from "./schema.js";

function commitSortKey(c: CommitSample): [number, string] {
  const ms = Date.parse(c.date);
  return [Number.isFinite(ms) ? -ms : 0, c.sha];
}

function prSortKey(p: PrSample): [number, number] {
  const ms = Date.parse(p.created_at);
  return [Number.isFinite(ms) ? -ms : 0, p.number];
}

export function sortCommits(commits: CommitSample[]): CommitSample[] {
  return [...commits].sort((a, b) => {
    const [da, sa] = commitSortKey(a);
    const [db, sb] = commitSortKey(b);
    if (da !== db) return da - db;
    return sa.localeCompare(sb);
  });
}

export function sortPullRequests(prs: PrSample[]): PrSample[] {
  return [...prs].sort((a, b) => {
    const [da, na] = prSortKey(a);
    const [db, nb] = prSortKey(b);
    if (da !== db) return da - db;
    return na - nb;
  });
}

function commitChanged(a: CommitSample, b: CommitSample): boolean {
  return a.subject !== b.subject || a.date !== b.date || a.author !== b.author;
}

function prChanged(a: PrSample, b: PrSample): boolean {
  return (
    a.title !== b.title ||
    a.state !== b.state ||
    a.created_at !== b.created_at ||
    a.merged_at !== b.merged_at ||
    a.labels !== b.labels
  );
}

export interface CommitMergeResult {
  merged: CommitSample[];
  added: string[];
  updated: string[];
}

export interface PullRequestMergeResult {
  merged: PrSample[];
  added: number[];
  updated: number[];
}

export function mergeCommitsBySha(
  prior: CommitSample[],
  fetched: CommitSample[],
): CommitMergeResult {
  const bySha = new Map<string, CommitSample>();
  for (const commit of prior) {
    bySha.set(commit.sha, commit);
  }

  const added: string[] = [];
  const updated: string[] = [];

  for (const commit of fetched) {
    const existing = bySha.get(commit.sha);
    if (!existing) {
      bySha.set(commit.sha, commit);
      added.push(commit.sha);
      continue;
    }
    if (commitChanged(existing, commit)) {
      bySha.set(commit.sha, commit);
      updated.push(commit.sha);
    }
  }

  return {
    merged: sortCommits([...bySha.values()]),
    added: sortCommits(added.map((sha) => bySha.get(sha)!)).map((c) => c.sha),
    updated: sortCommits(updated.map((sha) => bySha.get(sha)!)).map((c) => c.sha),
  };
}

export function mergePullRequestsByNumber(
  prior: PrSample[],
  fetched: PrSample[],
): PullRequestMergeResult {
  const byNumber = new Map<number, PrSample>();
  for (const pr of prior) {
    byNumber.set(pr.number, pr);
  }

  const added: number[] = [];
  const updated: number[] = [];

  for (const pr of fetched) {
    const existing = byNumber.get(pr.number);
    if (!existing) {
      byNumber.set(pr.number, pr);
      added.push(pr.number);
      continue;
    }
    if (prChanged(existing, pr)) {
      byNumber.set(pr.number, pr);
      updated.push(pr.number);
    }
  }

  return {
    merged: sortPullRequests([...byNumber.values()]),
    added: sortPullRequests(added.map((n) => byNumber.get(n)!)).map((p) => p.number),
    updated: sortPullRequests(updated.map((n) => byNumber.get(n)!)).map((p) => p.number),
  };
}

export function dedupeFetchedCommitsBySha(
  fetched: CommitSample[],
): CommitSample[] {
  const seen = new Set<string>();
  const unique: CommitSample[] = [];
  for (const commit of fetched) {
    if (seen.has(commit.sha)) continue;
    seen.add(commit.sha);
    unique.push(commit);
  }
  return unique;
}
