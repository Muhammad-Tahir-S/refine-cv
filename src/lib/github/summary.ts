import {
  escapeMarkdownHeading,
  escapeMarkdownInline,
  formatMarkdownCode,
} from "../jobs/markdown-safe.js";
import type { GithubDelta, RepoSnapshot } from "./schema.js";
import type { CommitSample } from "./schema.js";

function yearMonth(date: string): string {
  if (!date || date.length < 7) return "unknown";
  return date.slice(0, 7);
}

function buildActivityTimeline(repos: RepoSnapshot[]): string[] {
  const byMonth = new Map<string, { commits: number; prs: number; repos: Set<string> }>();

  for (const r of repos) {
    for (const c of r.commits) {
      const ym = yearMonth(c.date);
      const row = byMonth.get(ym) ?? {
        commits: 0,
        prs: 0,
        repos: new Set<string>(),
      };
      row.commits += 1;
      row.repos.add(r.repo);
      byMonth.set(ym, row);
    }
    for (const pr of r.pullRequests) {
      const ym = yearMonth(pr.created_at);
      const row = byMonth.get(ym) ?? {
        commits: 0,
        prs: 0,
        repos: new Set<string>(),
      };
      row.prs += 1;
      row.repos.add(r.repo);
      byMonth.set(ym, row);
    }
  }

  const lines: string[] = [];
  for (const ym of [...byMonth.keys()].sort().reverse()) {
    const row = byMonth.get(ym)!;
    lines.push(
      `- **${ym}** — ${row.commits} commits, ${row.prs} PRs across ${row.repos.size} repo(s)`,
    );
  }
  return lines;
}

function notableCommits(commits: CommitSample[], limit: number): CommitSample[] {
  const skip = /^(merge|v\d|version bump|bump)/i;
  const picked: CommitSample[] = [];
  for (const c of commits) {
    if (skip.test(c.subject)) continue;
    picked.push(c);
    if (picked.length >= limit) break;
  }
  if (picked.length < limit) {
    for (const c of commits) {
      if (picked.includes(c)) continue;
      picked.push(c);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

function reposWithEvidence(repos: RepoSnapshot[]): RepoSnapshot[] {
  return repos.filter(
    (r) => r.commits.length > 0 || r.pullRequests.length > 0,
  );
}

function formatDeltaLine(delta: GithubDelta | undefined): string {
  if (!delta) {
    return "_No refresh delta supplied._";
  }
  const { aggregateDelta } = delta;
  return (
    `_This refresh delta: +${aggregateDelta.commitsAdded} commits, ~${aggregateDelta.commitsUpdated} updated; ` +
    `+${aggregateDelta.pullRequestsAdded} PRs, ~${aggregateDelta.pullRequestsUpdated} updated ` +
    `across ${delta.reposSucceeded.length} repo(s)` +
    (delta.reposFailed.length > 0
      ? ` (${delta.reposFailed.length} repo(s) failed; prior evidence retained).`
      : ".")
  );
}

export function buildGithubSummaryMarkdown(
  generatedAt: string,
  repos: RepoSnapshot[],
  aggregateLanguages: Record<string, number>,
  totals: {
    totalCommits: number;
    totalPullRequests: number;
    repoCount: number;
  },
  delta?: GithubDelta,
): string {
  const activeRepos = reposWithEvidence(repos);

  const lines: string[] = [
    "# GitHub evidence summary",
    "",
    `**Generated:** ${escapeMarkdownInline(generatedAt)}`,
    "",
    `_Complete known evidence: **${totals.totalCommits}** your commits and **${totals.totalPullRequests}** your PRs (open, closed, merged) across **${totals.repoCount}** selected repo(s) with **${activeRepos.length}** repo(s) containing evidence. Stored in github-index.json (v4 snapshot)._`,
    "",
    formatDeltaLine(delta),
    "",
    "## Activity timeline (your commits + PRs)",
    "",
    ...buildActivityTimeline(repos),
    "",
    "## Repos indexed",
    "",
  ];

  for (const r of activeRepos) {
    const themes =
      r.inferredThemes.length > 0
        ? r.inferredThemes.map((t) => escapeMarkdownInline(t)).join(", ")
        : "none";
    const prOpen = r.pullRequests.filter((p) => p.state === "open").length;
    const prMerged = r.pullRequests.filter((p) => p.merged_at).length;
    const repoDelta = delta?.perRepo[r.repo];
    const deltaHint = repoDelta
      ? `; this refresh +${repoDelta.commitsAdded.length}/~${repoDelta.commitsUpdated.length} commits, +${repoDelta.pullRequestsAdded.length}/~${repoDelta.pullRequestsUpdated.length} PRs`
      : "";
    lines.push(
      `- ${formatMarkdownCode(r.repo)} — ${r.commits.length} commits, ${r.pullRequests.length} PRs (${prMerged} merged, ${prOpen} open); themes: ${themes}${deltaHint}`,
    );
  }

  lines.push("", "## Technical themes", "");
  const allThemes = new Set<string>();
  for (const r of activeRepos) {
    for (const t of r.inferredThemes) allThemes.add(t);
  }
  for (const t of [...allThemes].sort()) {
    lines.push(
      `- \`verified-from-github\` — recurring theme: **${escapeMarkdownInline(t)}** (from your commit/PR text)`,
    );
  }

  lines.push("", "## Languages (aggregate)", "");
  const langEntries = Object.entries(aggregateLanguages).sort(
    (a, b) => b[1] - a[1],
  );
  for (const [lang, bytes] of langEntries) {
    lines.push(
      `- ${escapeMarkdownInline(lang)}: ${bytes} bytes (repo language stats, summed once per repo)`,
    );
  }

  lines.push("", "## Work history by repo (draft bullets)", "");
  for (const r of activeRepos) {
    if (r.commits.length === 0 && r.pullRequests.length === 0) continue;
    lines.push("", `### ${escapeMarkdownHeading(r.repo)}`, "");
    const notable = notableCommits(r.commits, 8);
    for (const c of notable) {
      lines.push(
        `- \`needs-your-confirmation\` — ${escapeMarkdownInline(c.date.slice(0, 10))}: ${escapeMarkdownInline(c.subject)}`,
      );
    }
    for (const pr of r.pullRequests.slice(0, 8)) {
      const status = pr.merged_at
        ? "merged"
        : pr.state === "open"
          ? "open"
          : pr.state;
      lines.push(
        `- \`needs-your-confirmation\` — PR #${pr.number} (${escapeMarkdownInline(status)}, ${escapeMarkdownInline(pr.created_at.slice(0, 10))}): ${escapeMarkdownInline(pr.title)}`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}
