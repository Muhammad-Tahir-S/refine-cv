import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Resolve GitHub token: GITHUB_TOKEN env, local .env, then `gh auth token`.
 */
export function getGitHubToken(): string {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const fromDotEnv = readTokenFromDotEnv();
  if (fromDotEnv) return fromDotEnv;

  try {
    const token = execSync("gh auth token", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (token) return token;
  } catch {
    // gh not installed or not logged in
  }

  throw new Error(
    "GitHub authentication required. Set GITHUB_TOKEN in .env or run: gh auth login",
  );
}

function readTokenFromDotEnv(): string | null {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return null;

  const content = readFileSync(envPath, "utf8");
  const match = content.match(/^GITHUB_TOKEN\s*=\s*(.+)$/m);
  if (!match) return null;

  return match[1].trim().replace(/^['"]|['"]$/g, "") || null;
}
