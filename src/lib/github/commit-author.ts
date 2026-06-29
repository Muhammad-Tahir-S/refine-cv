import type { Octokit } from "@octokit/rest";

export type CommitAuthorIdentity = {
  githubLogins: string[];
  commitNames: string[];
};

const DEFAULT_COMMIT_NAMES = ["Muhammad-Tahir Sanuth", "Muhammad-Tahir"];

export async function resolveCommitAuthorIdentity(
  octokit: Octokit,
  githubUsername?: string,
  extraNames: string[] = [],
): Promise<CommitAuthorIdentity> {
  const githubLogins = new Set<string>();
  if (githubUsername?.trim()) {
    githubLogins.add(githubUsername.trim().toLowerCase());
  }

  try {
    const { data: me } = await octokit.users.getAuthenticated();
    if (me.login) githubLogins.add(me.login.toLowerCase());
    if (me.name?.trim()) extraNames.push(me.name.trim());
  } catch {
    /* token may lack user scope; username + commit names still apply */
  }

  const commitNames = new Set<string>([
    ...DEFAULT_COMMIT_NAMES,
    ...extraNames.filter(Boolean),
  ]);

  return {
    githubLogins: [...githubLogins],
    commitNames: [...commitNames],
  };
}

type CommitLike = {
  author?: { login?: string | null } | null;
  commit: {
    author?: { name?: string | null; email?: string | null } | null;
    committer?: { name?: string | null; email?: string | null } | null;
  };
};

function nameMatches(name: string, identity: CommitAuthorIdentity): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  return identity.commitNames.some(
    (n) =>
      normalized === n.trim().toLowerCase() ||
      normalized.startsWith(`${n.trim().toLowerCase()} `),
  );
}

export function isOwnCommit(
  commit: CommitLike,
  identity: CommitAuthorIdentity,
): boolean {
  const login = commit.author?.login?.toLowerCase();
  if (login && identity.githubLogins.includes(login)) return true;

  const authorName = commit.commit.author?.name ?? "";
  const committerName = commit.commit.committer?.name ?? "";
  return (
    nameMatches(authorName, identity) || nameMatches(committerName, identity)
  );
}

export function isOwnPullRequest(
  pr: { user?: { login?: string | null } | null },
  identity: CommitAuthorIdentity,
): boolean {
  const login = pr.user?.login?.toLowerCase();
  return Boolean(login && identity.githubLogins.includes(login));
}
