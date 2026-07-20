import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseIndexState, type IndexState } from "../config.js";
import {
  atomicWriteFile,
  atomicWriteJson,
  loadPersistedState,
  readJsonFile,
  type AtomicWriteOptions,
} from "../jobs/persistence.js";
import type { GithubDelta, GithubIndexV4 } from "./schema.js";
import { parseGithubDelta, parseGithubIndexV4 } from "./schema.js";
import { loadGithubIndexDocument } from "./migrate.js";

export const GITHUB_ARTIFACT_NAMES = {
  index: "github-index.json",
  summary: "github-summary.md",
  delta: "github-delta.json",
  refreshLog: "refresh-log.md",
  indexState: "index-state.json",
} as const;

export interface GithubArtifactPaths {
  profileDir: string;
  githubIndex: string;
  githubSummary: string;
  githubDelta: string;
  refreshLog: string;
  indexState: string;
}

export function defaultGithubArtifactPaths(profileDir: string): GithubArtifactPaths {
  return {
    profileDir,
    githubIndex: join(profileDir, GITHUB_ARTIFACT_NAMES.index),
    githubSummary: join(profileDir, GITHUB_ARTIFACT_NAMES.summary),
    githubDelta: join(profileDir, GITHUB_ARTIFACT_NAMES.delta),
    refreshLog: join(profileDir, GITHUB_ARTIFACT_NAMES.refreshLog),
    indexState: join(profileDir, GITHUB_ARTIFACT_NAMES.indexState),
  };
}

export interface PublishGithubRefreshInput {
  paths: GithubArtifactPaths;
  index: GithubIndexV4;
  summaryMarkdown: string;
  delta: GithubDelta;
  refreshLogMarkdown: string;
  indexState: IndexState;
  writeAtomicFile?: (
    targetPath: string,
    content: string,
    options?: AtomicWriteOptions,
  ) => void;
  writeAtomicJson?: <T>(
    targetPath: string,
    value: T,
    options?: AtomicWriteOptions,
  ) => void;
}

export function publishGithubRefresh(input: PublishGithubRefreshInput): void {
  const writeAtomicFile = input.writeAtomicFile ?? atomicWriteFile;
  const writeAtomicJson = input.writeAtomicJson ?? atomicWriteJson;

  parseGithubIndexV4(input.index);
  parseGithubDelta(input.delta);

  // Publish derived/non-authoritative artifacts first. The index is the
  // durable evidence snapshot, and index-state is its commit marker.
  writeAtomicFile(input.paths.githubSummary, input.summaryMarkdown, {
    backup: true,
  });
  writeAtomicJson(input.paths.githubDelta, input.delta, { backup: true });
  writeAtomicFile(input.paths.refreshLog, input.refreshLogMarkdown, {
    backup: true,
  });
  writeAtomicJson(input.paths.githubIndex, input.index, { backup: true });
  writeAtomicJson(input.paths.indexState, input.indexState, { backup: true });
}

export function loadPriorGithubIndex(
  indexPath: string,
  indexStatePath: string,
): GithubIndexV4 | null {
  if (!existsSync(indexPath)) {
    return null;
  }

  const indexState = existsSync(indexStatePath)
    ? loadPersistedState(
        indexStatePath,
        parseIndexState,
        (): IndexState => ({ version: 1, lastFullIndexAt: null, repos: {} }),
      )
    : undefined;

  const raw = readJsonFile(indexPath);
  return loadGithubIndexDocument(raw, indexState, indexPath);
}

export function readRefreshLog(path: string): string {
  if (!existsSync(path)) {
    return "";
  }
  return readFileSync(path, "utf8");
}
