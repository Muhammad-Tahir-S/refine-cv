import { escapeMarkdownTableCell } from "../jobs/markdown-safe.js";
import type { GithubDelta } from "./schema.js";

export const REFRESH_LOG_HEADER = `# GitHub profile refresh log

| Timestamp (UTC) | Status | Repos touched | Delta summary |
|-----------------|--------|---------------|----------------|
`;

export function formatRefreshLogDeltaSummary(delta: GithubDelta): string {
  const { aggregateDelta } = delta;
  const failed = delta.reposFailed.length;
  const parts = [
    `commits+${aggregateDelta.commitsAdded}`,
    `commits~${aggregateDelta.commitsUpdated}`,
    `prs+${aggregateDelta.pullRequestsAdded}`,
    `prs~${aggregateDelta.pullRequestsUpdated}`,
  ];
  if (failed > 0) {
    parts.push(`failed=${failed}`);
  }
  return parts.join(" ");
}

export function formatRefreshLogRow(
  delta: GithubDelta,
  status: "success" | "partial" | "failed",
): string {
  const reposTouched = [...delta.reposSucceeded, ...delta.reposFailed.map((f) => f.repo)]
    .sort()
    .join(" ");
  return `| ${escapeMarkdownTableCell(delta.runAt)} | ${escapeMarkdownTableCell(status)} | ${escapeMarkdownTableCell(reposTouched || "—")} | ${escapeMarkdownTableCell(formatRefreshLogDeltaSummary(delta))} |\n`;
}

export function appendRefreshLogRow(
  existingMarkdown: string,
  delta: GithubDelta,
  status: "success" | "partial" | "failed",
): string {
  const base = existingMarkdown.trimEnd();
  const header = base.length > 0 ? `${base}\n` : REFRESH_LOG_HEADER;
  if (!base.includes("| Timestamp (UTC) |")) {
    return `${REFRESH_LOG_HEADER}${formatRefreshLogRow(delta, status)}`;
  }
  return `${header}${formatRefreshLogRow(delta, status)}`;
}

export function refreshLogStatus(delta: GithubDelta): "success" | "partial" | "failed" {
  if (delta.reposSucceeded.length === 0 && delta.reposFailed.length > 0) {
    return "failed";
  }
  if (delta.reposFailed.length > 0) {
    return "partial";
  }
  return "success";
}
