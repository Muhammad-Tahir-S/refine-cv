export type ContributedNode = {
  nameWithOwner: string;
  pushedAt: string | null;
  isPrivate: boolean;
  isFork: boolean;
  description: string | null;
  primaryLanguage: { name: string } | null;
};

export type RepoCandidateSource = "owned" | "contributed" | "accessible";

export interface RepoCandidate {
  nameWithOwner: string;
  pushedAt: string;
  isPrivate: boolean;
  isFork: boolean;
  description: string;
  primaryLanguage: string | null;
  sources: RepoCandidateSource[];
}
