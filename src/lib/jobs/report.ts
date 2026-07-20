import type { GeoEligibility, JobPosting, ScanRunResult } from "./types.js";
import { geoEligibilityLabel, loadJobSearchConfig, resolveRoleProfile } from "./geo.js";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function formatLevel(level: JobPosting["level"]): string {
  switch (level) {
    case "junior":
      return "Junior";
    case "mid":
      return "Mid";
    case "senior":
      return "Senior";
    case "staff_lead":
      return "Staff/Lead";
    default:
      return "Unknown";
  }
}

function formatRemoteScope(scope: JobPosting["remoteScope"]): string {
  switch (scope) {
    case "global":
      return "Global remote";
    case "emea":
      return "EMEA/regional";
    case "regional":
      return "Regional/restricted";
    default:
      return "Remote (verify scope)";
  }
}

function formatGeoEligibility(eligibility: GeoEligibility | undefined): string {
  if (!eligibility) {
    return "Unknown";
  }
  return geoEligibilityLabel(eligibility);
}

function jobTableRows(
  jobs: JobPosting[],
  options: { status?: Map<string, "New" | "Seen"> } = {},
): string {
  if (jobs.length === 0) {
    return "_No listings in this section._\n";
  }

  const showStatus = options.status && options.status.size > 0;
  const header = showStatus
    ? "| Status | Company | Role | Level | Remote | Geo | Source | Apply |\n|--------|--------|------|-------|--------|-----|--------|-------|\n"
    : "| Company | Role | Level | Remote | Geo | Source | Apply |\n|--------|------|-------|--------|-----|--------|-------|\n";

  const rows = jobs
    .map((job) => {
      const cells = [
        `**${escapeCell(job.company)}**`,
        escapeCell(job.title),
        formatLevel(job.level),
        formatRemoteScope(job.remoteScope),
        formatGeoEligibility(job.geoEligibility),
        job.source,
        job.url,
      ];
      if (showStatus) {
        const status = options.status?.get(job.dedupeKey) ?? "Seen";
        cells.unshift(status);
      }
      return `| ${cells.join(" | ")} |`;
    })
    .join("\n");
  return `${header}${rows}\n`;
}

function buildStatusMap(result: ScanRunResult): Map<string, "New" | "Seen"> {
  const status = new Map<string, "New" | "Seen">();
  for (const job of result.newJobs) {
    status.set(job.dedupeKey, "New");
  }
  for (const job of result.previouslySeen) {
    status.set(job.dedupeKey, "Seen");
  }
  return status;
}

function appliedChecklist(jobs: JobPosting[]): string {
  if (jobs.length === 0) {
    return "_No new listings this run._\n";
  }

  return jobs
    .map((job) => `- [ ] ${job.company} — ${job.title} — ${job.url}`)
    .join("\n");
}

function countByGeo(jobs: JobPosting[], eligibility: GeoEligibility): number {
  return jobs.filter((job) => job.geoEligibility === eligibility).length;
}

function sourceStatsTable(result: ScanRunResult): string {
  if (result.sourceStats.length === 0) {
    return "_No sources configured._\n";
  }

  const header =
    "| Source | Fetched | Quarantined | Matched | Status |\n|--------|--------:|------------:|--------:|--------|\n";
  const rows = result.sourceStats
    .map((stat) => {
      const status = stat.failed ? "Error" : "OK";
      return `| ${stat.sourceId} (${stat.adapter}) | ${stat.fetched} | ${stat.quarantined} | ${stat.matched} | ${status} |`;
    })
    .join("\n");
  return `${header}${rows}\n`;
}

export function renderScanReport(result: ScanRunResult, options: { isolated?: boolean } = {}): string {
  const config = loadJobSearchConfig();
  const profile = resolveRoleProfile(config);
  const roleCriteria =
    profile === "nodejsBackend"
      ? "- Node.js / backend focus (NestJS, Express, API/server-side)\n- Junior → mid level (senior/staff flagged and excluded when configured)"
      : "- React / frontend focus\n- Junior → senior level (staff/lead flagged, not dropped)";
  const configLabel = options.isolated
    ? "`config/job-search-nodejs-backend.json` (isolated run)"
    : "`config/job-search.json`";
  const filterLabel =
    profile === "nodejsBackend"
      ? "Node.js/backend + geo eligibility"
      : "React/frontend + geo eligibility";
  const statusByKey = buildStatusMap(result);
  const newNigeriaEligible = result.newJobs.filter(
    (job) => job.geoEligibility === "nigeria_eligible",
  );
  const newVerifyGeo = result.newJobs.filter((job) => job.geoEligibility === "verify_geo");
  const allNigeriaEligible = result.allMatched.filter(
    (job) => job.geoEligibility === "nigeria_eligible",
  );
  const allVerifyGeo = result.allMatched.filter((job) => job.geoEligibility === "verify_geo");

  const stats = [
    `| Total matched (after filters) | ${result.allMatched.length} |`,
    `| — Nigeria-eligible | ${countByGeo(result.allMatched, "nigeria_eligible")} |`,
    `| — Verify geo | ${countByGeo(result.allMatched, "verify_geo")} |`,
    `| New this run | **${result.newJobs.length}** |`,
    `| Previously seen (still open) | ${result.previouslySeen.length} |`,
    `| Excluded by filter | ${result.excluded.length} |`,
    `| Blocklisted employers | ${result.blocklistExcluded} |`,
    `| Source fetch errors | ${result.fetchErrors.length} |`,
  ].join("\n");

  const fetchErrors =
    result.fetchErrors.length === 0
      ? "_None._"
      : result.fetchErrors.map((e) => `- **${e.sourceId} (${e.adapter}):** ${e.error}`).join("\n");

  const excludedSample =
    result.excluded.length === 0
      ? "_None._"
      : result.excluded
          .slice(0, 15)
          .map((e) => `- ${e.posting.company} — ${e.posting.title}: ${e.reason}`)
          .join("\n");

  const newSummary =
    result.newJobs.length === 0
      ? "_No new listings this run — all matches below were seen in a prior scan._"
      : `**${result.newJobs.length}** new listing(s) this run.`;

  return `# Job Scan Report

**Scan date:** ${result.scanDate}  
**Primary output:** this Markdown file (\`report.md\`). \`raw.json\` is a machine archive only.  
**Source:** Public job boards (\`config/job-sources.json\`) — Himalayas, Jobicy, Remotive, Arbeitnow, Remote OK, We Work Remotely, HN Who is Hiring  
**Applicant geo:** ${config.applicant.citizenship} citizen, work permit in ${config.applicant.workPermitCountries.join(", ")} only (${configLabel})  
**New this run:** ${newSummary}  
**Criteria:**
${roleCriteria}
- **Nigeria-eligible:** global remote or explicit Nigeria/Africa/unrestricted hire signals
- **Verify geo:** EMEA or unclear remote — manual check before applying
- **Likely excluded:** EU/UK/US-only, hybrid/on-site, or Africa-excluded listings

---

## Method

1. Fetch enabled public job boards from \`config/job-sources.json\` (no login required).
2. Normalize listings, apply employer blocklist from \`config/job-search.json\`.
3. Filter for ${filterLabel} (\`src/lib/jobs/geo.ts\`).
4. Dedupe against \`~/.config/refine-cv/scan-state.json\` and applied jobs from prior report checkboxes.
5. LinkedIn discovery remains optional (\`pnpm discover-linkedin\`) and separate from this scan.

---

## All matched — Nigeria-eligible

Prioritize these. **Status:** New = first time seen; Seen = still open from a prior scan.

${jobTableRows(allNigeriaEligible, { status: statusByKey })}

## All matched — verify geo

Roles with EMEA or unclear remote scope without explicit Nigeria/Africa hire language. Confirm eligibility on the listing before applying.

${jobTableRows(allVerifyGeo, { status: statusByKey })}

${
  result.newJobs.length > 0
    ? `---

## New this run — Nigeria-eligible

${jobTableRows(newNigeriaEligible)}

## New this run — verify geo

${jobTableRows(newVerifyGeo)}

`
    : ""
}---

## Source stats

${sourceStatsTable(result)}

---

## Scan stats

| Metric | Count |
|--------|------:|
${stats}

---

## Fetch errors

${fetchErrors}

---

## Excluded sample (first 15)

Includes likely geo exclusions (EU/UK/US-only, hybrid, Africa excluded) and non-matching roles.

${excludedSample}

---

## New listings — mark applied

Tick boxes after applying; the next \`pnpm scan-jobs\` run merges checked items into \`~/.config/refine-cv/applied-jobs.json\`.

${appliedChecklist(result.newJobs)}

*Generated by refine-cv job scan pipeline.*
`;
}
