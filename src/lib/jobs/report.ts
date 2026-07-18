import type { GeoEligibility, JobPosting, ScanRunResult } from "./types.js";
import { geoEligibilityLabel, loadJobSearchConfig } from "./geo.js";

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

function jobTableRows(jobs: JobPosting[]): string {
  if (jobs.length === 0) {
    return "_No listings in this section._\n";
  }

  const header =
    "| Company | Role | Level | Remote | Geo | Apply |\n|--------|------|-------|--------|-----|-------|\n";
  const rows = jobs
    .map(
      (job) =>
        `| **${escapeCell(job.company)}** | ${escapeCell(job.title)} | ${formatLevel(job.level)} | ${formatRemoteScope(job.remoteScope)} | ${formatGeoEligibility(job.geoEligibility)} | ${job.url} |`,
    )
    .join("\n");
  return `${header}${rows}\n`;
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

export function renderScanReport(result: ScanRunResult): string {
  const config = loadJobSearchConfig();
  const nigeriaEligibleJobs = result.newJobs.filter(
    (job) => job.geoEligibility === "nigeria_eligible",
  );
  const verifyGeoJobs = result.newJobs.filter((job) => job.geoEligibility === "verify_geo");

  const stats = [
    `| Total matched (after filters) | ${result.allMatched.length} |`,
    `| — Nigeria-eligible | ${countByGeo(result.allMatched, "nigeria_eligible")} |`,
    `| — Verify geo | ${countByGeo(result.allMatched, "verify_geo")} |`,
    `| New this run | **${result.newJobs.length}** |`,
    `| Previously seen (still open) | ${result.previouslySeen.length} |`,
    `| Excluded by filter | ${result.excluded.length} |`,
    `| Fetch errors | ${result.fetchErrors.length} |`,
  ].join("\n");

  const fetchErrors =
    result.fetchErrors.length === 0
      ? "_None._"
      : result.fetchErrors.map((e) => `- **${e.company}:** ${e.error}`).join("\n");

  const excludedSample =
    result.excluded.length === 0
      ? "_None._"
      : result.excluded
          .slice(0, 15)
          .map((e) => `- ${e.posting.company} — ${e.posting.title}: ${e.reason}`)
          .join("\n");

  return `# Job Scan Report

**Scan date:** ${result.scanDate}  
**Source:** ATS registry (\`config/companies.json\`) — Greenhouse, Lever, Ashby, Workable, custom careers pages  
**Applicant geo:** ${config.applicant.citizenship} citizen, work permit in ${config.applicant.workPermitCountries.join(", ")} only (\`config/job-search.json\`)  
**Criteria:**
- React / frontend focus
- Junior → senior level (staff/lead flagged, not dropped)
- **Nigeria-eligible:** global remote or explicit Nigeria/Africa/unrestricted hire signals
- **Verify geo:** EMEA or unclear remote — manual check before applying
- **Likely excluded:** EU/UK/US-only, hybrid/on-site, or Africa-excluded listings

---

## Method

1. Fetch all registered company boards via public ATS JSON APIs (or custom careers HTML for non-ATS employers).
2. Filter for React/frontend + geo eligibility (\`src/lib/jobs/geo.ts\`).
3. Dedupe against \`~/.config/refine-cv/scan-state.json\` and applied jobs from prior report checkboxes.
4. LinkedIn discovery is a separate low-volume step (\`pnpm discover-linkedin\`).

---

## New listings — Nigeria-eligible

${jobTableRows(nigeriaEligibleJobs)}

## New listings — verify geo

Roles with EMEA or unclear remote scope without explicit Nigeria/Africa hire language. Confirm eligibility on the listing before applying.

${jobTableRows(verifyGeoJobs)}

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

Includes likely geo exclusions (EU/UK/US-only, hybrid, Africa excluded) and non-frontend roles.

${excludedSample}

---

## New listings — mark applied

Tick boxes after applying; the next \`pnpm scan-jobs\` run merges checked items into \`~/.config/refine-cv/applied-jobs.json\`.

${appliedChecklist(result.newJobs)}

*Generated by refine-cv job scan pipeline.*
`;
}
