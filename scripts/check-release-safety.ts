import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const TRACKED_ENV_PREFIXES = [".env"];

const SECRET_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "GitHub classic PAT", pattern: /ghp_[A-Za-z0-9]{20,}/ },
  { label: "GitHub fine-grained PAT", pattern: /github_pat_[A-Za-z0-9_]{20,}/ },
  { label: "OpenAI-style API key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  {
    label: "private key header",
    pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
];

const TRACKED_PERSONAL_PATHS: Array<{ label: string; test: (path: string) => boolean }> = [
  {
    label: "personal profile file",
    test: (path) => path.startsWith("profile/") && path !== "profile/ONBOARDING.md",
  },
  {
    label: "job application artifact",
    test: (path) => path.startsWith("jobs/") && path !== "jobs/.gitkeep",
  },
  {
    label: "personal GitHub config",
    test: (path) => path === "config/github-repos.json",
  },
  {
    label: "personal job search config",
    test: (path) =>
      path === "config/job-search.json" || path === "config/job-search-nodejs-backend.json",
  },
];

function listTrackedFiles(): string[] {
  return execSync("git ls-files -z", { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function isTrackedEnvFile(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  if (base === ".env.example") {
    return false;
  }
  if (TRACKED_ENV_PREFIXES.some((prefix) => base === prefix || base.startsWith(`${prefix}.`))) {
    return true;
  }
  if (base.endsWith(".pem") || base.endsWith(".pat")) {
    return true;
  }
  return false;
}

export function scanTrackedPath(path: string): string[] {
  const issues: string[] = [];

  if (isTrackedEnvFile(path)) {
    issues.push(`${path}: tracked secrets or env file`);
    return issues;
  }

  for (const { label, test } of TRACKED_PERSONAL_PATHS) {
    if (test(path)) {
      issues.push(`${path}: tracked ${label}`);
      return issues;
    }
  }

  return issues;
}

function scanFileContent(path: string): string[] {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return [];
  }

  const issues: string[] = [];
  for (const { label, pattern } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      issues.push(`${path}: possible ${label}`);
    }
  }
  return issues;
}

export function runReleaseSafetyCheck(): number {
  const tracked = listTrackedFiles();
  const issues = tracked.flatMap((path) => [...scanTrackedPath(path), ...scanFileContent(path)]);

  if (issues.length === 0) {
    console.log("Release safety check passed.");
    return 0;
  }

  console.error("Release safety check failed:\n");
  for (const issue of issues) {
    console.error(`  - ${issue}`);
  }
  return 1;
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(invokedPath))
) {
  process.exit(runReleaseSafetyCheck());
}
