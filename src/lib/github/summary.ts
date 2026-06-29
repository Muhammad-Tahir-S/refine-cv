import type { RepoIndexEntry, CommitSample } from "./index-repos.js";

function yearMonth(date: string): string {
  if (!date || date.length < 7) return "unknown";
  return date.slice(0, 7);
}

function buildActivityTimeline(repos: RepoIndexEntry[]): string[] {
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

export function buildGithubSummaryMarkdown(
  generatedAt: string,
  repos: RepoIndexEntry[],
  aggregateLanguages: Record<string, number>,
): string {
  const activeRepos = repos.filter(
    (r) => r.commitCountThisRun > 0 || r.pullRequests.length > 0,
  );
  const totalCommits = repos.reduce((n, r) => n + r.commitCountThisRun, 0);
  const totalPrs = repos.reduce((n, r) => n + r.pullRequests.length, 0);

  const lines: string[] = [
    "# GitHub evidence summary",
    "",
    `**Generated:** ${generatedAt}`,
    "",
    `_Full work history: **${totalCommits}** your commits and **${totalPrs}** your PRs (open, closed, merged) in **${activeRepos.length}** active repos. Stored in github-index.json (commits / pullRequests per repo)._`,
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
      r.inferredThemes.length > 0 ? r.inferredThemes.join(", ") : "none";
    const prOpen = r.pullRequests.filter((p) => p.state === "open").length;
    const prMerged = r.pullRequests.filter((p) => p.merged_at).length;
    lines.push(
      `- \`${r.repo}\` — ${r.commitCountThisRun} commits, ${r.pullRequests.length} PRs (${prMerged} merged, ${prOpen} open); themes: ${themes}`,
    );
  }

  lines.push("", "## Technical themes", "");
  const allThemes = new Set<string>();
  for (const r of activeRepos) {
    for (const t of r.inferredThemes) allThemes.add(t);
  }
  for (const t of [...allThemes].sort()) {
    lines.push(
      `- \`verified-from-github\` — recurring theme: **${t}** (from your commit/PR text)`,
    );
  }

  lines.push("", "## Languages (aggregate)", "");
  const langEntries = Object.entries(aggregateLanguages).sort(
    (a, b) => b[1] - a[1],
  );
  for (const [lang, bytes] of langEntries) {
    lines.push(`- ${lang}: ${bytes} bytes (repo language stats)`);
  }

  lines.push("", "## Work history by repo (draft bullets)", "");
  for (const r of activeRepos) {
    if (r.commitCountThisRun === 0 && r.pullRequests.length === 0) continue;
    lines.push("", `### ${r.repo}`, "");
    const notable = notableCommits(r.commits, 8);
    for (const c of notable) {
      lines.push(
        `- \`needs-your-confirmation\` — ${c.date.slice(0, 10)}: ${c.subject}`,
      );
    }
    for (const pr of r.pullRequests.slice(0, 8)) {
      const status = pr.merged_at
        ? "merged"
        : pr.state === "open"
          ? "open"
          : pr.state;
      lines.push(
        `- \`needs-your-confirmation\` — PR #${pr.number} (${status}, ${pr.created_at.slice(0, 10)}): ${pr.title}`,
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}
