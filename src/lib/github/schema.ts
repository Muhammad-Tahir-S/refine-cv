import { z } from "zod";
import type { CommitAuthorIdentity } from "./commit-author.js";

export const GITHUB_INDEX_VERSION = 4 as const;
export const GITHUB_DELTA_VERSION = 1 as const;
export const DEFAULT_WATERMARK_OVERLAP_SECONDS = 3600;

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

export interface RepoCompleteness {
  commitsHistoryComplete: boolean;
  pullRequestsHistoryComplete: boolean;
  commitsTruncatedThisRun: boolean;
  pullRequestsTruncatedThisRun: boolean;
}

export interface RepoWatermark {
  lastIndexedAt: string;
  latestCommitSha: string;
  latestCommitDate: string;
  overlapSeconds: number;
}

export interface RepoSnapshot {
  repo: string;
  description: string;
  topics: string[];
  defaultBranch: string;
  pushedAt: string;
  languages: Record<string, number>;
  commits: CommitSample[];
  pullRequests: PrSample[];
  inferredThemes: string[];
  completeness: RepoCompleteness;
  watermark: RepoWatermark;
}

export interface GithubIndexAggregate {
  languages: Record<string, number>;
  repoCount: number;
  totalCommits: number;
  totalPullRequests: number;
}

export interface GithubIndexV4 {
  version: typeof GITHUB_INDEX_VERSION;
  snapshotAt: string;
  indexScope: "author-full-history";
  authorIdentity: CommitAuthorIdentity;
  selectedRepos: string[];
  repos: RepoSnapshot[];
  aggregate: GithubIndexAggregate;
}

export interface RepoDelta {
  fetchMode: "first-run" | "incremental";
  commitsAdded: string[];
  commitsUpdated: string[];
  pullRequestsAdded: number[];
  pullRequestsUpdated: number[];
  commitsFetchedThisRun: number;
  pullRequestsFetchedThisRun: number;
}

export interface RepoFailure {
  repo: string;
  error: string;
}

export interface GithubDelta {
  version: typeof GITHUB_DELTA_VERSION;
  runAt: string;
  reposAttempted: string[];
  reposSucceeded: string[];
  reposFailed: RepoFailure[];
  perRepo: Record<string, RepoDelta>;
  aggregateDelta: {
    commitsAdded: number;
    commitsUpdated: number;
    pullRequestsAdded: number;
    pullRequestsUpdated: number;
  };
  diagnostics: {
    watermarkOverlapSeconds: number;
    warnings: string[];
  };
}

const CommitSampleSchema = z.object({
  sha: z.string().min(1),
  subject: z.string(),
  date: z.string(),
  author: z.string(),
});

const PrSampleSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.string(),
  created_at: z.string(),
  merged_at: z.string(),
  labels: z.string(),
});

const RepoCompletenessSchema = z.object({
  commitsHistoryComplete: z.boolean(),
  pullRequestsHistoryComplete: z.boolean(),
  commitsTruncatedThisRun: z.boolean(),
  pullRequestsTruncatedThisRun: z.boolean(),
});

const RepoWatermarkSchema = z.object({
  lastIndexedAt: z.string(),
  latestCommitSha: z.string(),
  latestCommitDate: z.string(),
  overlapSeconds: z.number().int().nonnegative(),
});

const RepoSnapshotSchema = z.object({
  repo: z.string().min(1),
  description: z.string(),
  topics: z.array(z.string()),
  defaultBranch: z.string(),
  pushedAt: z.string(),
  languages: z.record(z.string(), z.number()),
  commits: z.array(CommitSampleSchema),
  pullRequests: z.array(PrSampleSchema),
  inferredThemes: z.array(z.string()),
  completeness: RepoCompletenessSchema,
  watermark: RepoWatermarkSchema,
});

const AuthorIdentitySchema = z.object({
  githubLogins: z.array(z.string()),
  commitNames: z.array(z.string()),
});

export const GithubIndexV4Schema = z.object({
  version: z.literal(GITHUB_INDEX_VERSION),
  snapshotAt: z.string(),
  indexScope: z.literal("author-full-history"),
  authorIdentity: AuthorIdentitySchema,
  selectedRepos: z.array(z.string()),
  repos: z.array(RepoSnapshotSchema),
  aggregate: z.object({
    languages: z.record(z.string(), z.number()),
    repoCount: z.number().int().nonnegative(),
    totalCommits: z.number().int().nonnegative(),
    totalPullRequests: z.number().int().nonnegative(),
  }),
});

export const GithubDeltaSchema = z.object({
  version: z.literal(GITHUB_DELTA_VERSION),
  runAt: z.string(),
  reposAttempted: z.array(z.string()),
  reposSucceeded: z.array(z.string()),
  reposFailed: z.array(
    z.object({
      repo: z.string(),
      error: z.string(),
    }),
  ),
  perRepo: z.record(
    z.string(),
    z.object({
      fetchMode: z.enum(["first-run", "incremental"]),
      commitsAdded: z.array(z.string()),
      commitsUpdated: z.array(z.string()),
      pullRequestsAdded: z.array(z.number().int().positive()),
      pullRequestsUpdated: z.array(z.number().int().positive()),
      commitsFetchedThisRun: z.number().int().nonnegative(),
      pullRequestsFetchedThisRun: z.number().int().nonnegative(),
    }),
  ),
  aggregateDelta: z.object({
    commitsAdded: z.number().int().nonnegative(),
    commitsUpdated: z.number().int().nonnegative(),
    pullRequestsAdded: z.number().int().nonnegative(),
    pullRequestsUpdated: z.number().int().nonnegative(),
  }),
  diagnostics: z.object({
    watermarkOverlapSeconds: z.number().int().nonnegative(),
    warnings: z.array(z.string()),
  }),
});

export class GithubIndexMigrationError extends Error {
  readonly preservedPath: string;
  readonly version: unknown;

  constructor(message: string, preservedPath: string, version: unknown, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GithubIndexMigrationError";
    this.preservedPath = preservedPath;
    this.version = version;
  }
}

export function parseGithubIndexV4(raw: unknown): GithubIndexV4 {
  return GithubIndexV4Schema.parse(raw);
}

export function parseGithubDelta(raw: unknown): GithubDelta {
  return GithubDeltaSchema.parse(raw);
}

export function validateGithubIndexV4(index: GithubIndexV4): GithubIndexV4 {
  return parseGithubIndexV4(index);
}

export function validateGithubDelta(delta: GithubDelta): GithubDelta {
  return parseGithubDelta(delta);
}
