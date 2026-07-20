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

function listTrackedFiles(): string[] {
  return execSync("git ls-files -z", { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function isTrackedEnvFile(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  if (TRACKED_ENV_PREFIXES.some((prefix) => base === prefix || base.startsWith(`${prefix}.`))) {
    return true;
  }
  if (base.endsWith(".pem") || base.endsWith(".pat")) {
    return true;
  }
  return false;
}

function scanFile(path: string): string[] {
  const issues: string[] = [];

  if (isTrackedEnvFile(path)) {
    issues.push(`${path}: tracked secrets or env file`);
    return issues;
  }

  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return issues;
  }

  for (const { label, pattern } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      issues.push(`${path}: possible ${label}`);
    }
  }

  return issues;
}

export function runReleaseSafetyCheck(): number {
  const issues = listTrackedFiles().flatMap(scanFile);

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
