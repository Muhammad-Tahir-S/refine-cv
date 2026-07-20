import {
  boardDisplayName,
  deriveRunOutcomeStatus,
} from "./manifest.js";
import {
  escapeChecklistSegment,
  escapeMarkdownTableCell,
  formatChecklistLine,
  formatMarkdownCode,
  formatMarkdownLink,
  sanitizeHttpUrl,
} from "./markdown-safe.js";
import type { GeoEligibility, JobPosting, ScanRunResult, SourceStats } from "./types.js";
import { geoEligibilityLabel } from "./geo.js";
import type { SerializedScanPolicy } from "./scan-policy.js";

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

function formatConfiguredSources(job: JobPosting): string {
  const sourceIds =
    job.configuredSourceIds.length > 0
      ? job.configuredSourceIds
      : job.provenance.map((record) => record.configuredSourceId);
  return [...new Set(sourceIds)].join(", ");
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
      const applyCell = (() => {
        const safeUrl = sanitizeHttpUrl(job.url);
        return safeUrl ? formatMarkdownLink("Apply", safeUrl) : escapeMarkdownTableCell(job.url);
      })();
      const cells = [
        `**${escapeMarkdownTableCell(job.company)}**`,
        escapeMarkdownTableCell(job.title),
        formatLevel(job.level),
        formatRemoteScope(job.remoteScope),
        formatGeoEligibility(job.geoEligibility),
        escapeMarkdownTableCell(formatConfiguredSources(job)),
        applyCell,
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
    .map((job) => formatChecklistLine(false, job.company, job.title, job.url))
    .join("\n");
}

function countByGeo(jobs: JobPosting[], eligibility: GeoEligibility): number {
  return jobs.filter((job) => job.geoEligibility === eligibility).length;
}

function formatAllowedLevels(levels: JobPosting["level"][]): string {
  return levels
    .map((level) => {
      switch (level) {
        case "staff_lead":
          return "staff/lead";
        default:
          return level;
      }
    })
    .join(", ");
}

function policyCriteriaLines(policy: SerializedScanPolicy): string {
  const roleLine =
    policy.roleProfile === "nodejsBackend"
      ? "- Node.js / backend focus (NestJS, Express, API/server-side)\n"
      : "- React / frontend focus\n";
  const levelsLine = `- Allowed levels: ${formatAllowedLevels(policy.allowedLevels)}\n`;
  return `${roleLine}${levelsLine}`;
}

function policyJsonBlock(result: ScanRunResult): string {
  return `\`\`\`json
${JSON.stringify(result.policy, null, 2)}
\`\`\``;
}

function formatOutcomeSummary(result: ScanRunResult): string {
  const status = deriveRunOutcomeStatus(result.outcome);
  switch (status) {
    case "all_cadence_skipped":
      return "All enabled sources were skipped due to minPollHours cadence — no fresh listing corpus was fetched this run.";
    case "total_outage":
      return `Total source outage — all ${result.outcome.attemptedSources} attempted source(s) failed. Prior scan state was not refreshed from board data.`;
    case "partial":
      return `Partial source failure — ${result.outcome.failedSources} of ${result.outcome.attemptedSources} attempted source(s) failed; successful sources still contributed listings.`;
    default:
      return "All attempted sources completed successfully.";
  }
}

function formatNewSummary(result: ScanRunResult): string {
  if (result.outcome.allSkippedDueToCadence) {
    return "_Cadence skip — matching counts reflect prior scan state only; boards were not polled._";
  }
  if (!result.hadSuccessfulSourceFetch) {
    return "_No source returned listings successfully — zero policy matches from this run's fetch._";
  }
  if (result.newJobs.length === 0) {
    return "_No new listings this run — all active matches below were seen in a prior scan._";
  }
  return `**${result.newJobs.length}** new listing(s) this run.`;
}

function sourceAttributionSection(result: ScanRunResult): string {
  if (result.sourceCatalog.length === 0) {
    return "_No sources configured._\n";
  }

  const header =
    "| Configured source | Board / adapter | Status | Request origin | Attribution |\n" +
    "|-------------------|-----------------|--------|----------------|-------------|\n";
  const statsById = new Map(result.sourceStats.map((stat) => [stat.sourceId, stat]));

  const rows = result.sourceCatalog
    .map((entry) => {
      const stat = statsById.get(entry.configuredSourceId);
      const status = formatSourceStatus(stat);
      const requestUrls =
        stat?.requestUrls ??
        (stat?.requestUrl ? [stat.requestUrl] : []);
      const requestOrigin = requestUrls.length > 0
        ? requestUrls
            .map((url, index) =>
              formatMarkdownLink(
                requestUrls.length === 1 ? "API/RSS" : `Request ${index + 1}`,
                url,
              ),
            )
            .join(", ")
        : stat?.status === "skipped"
          ? "_cadence skip_"
          : "_n/a_";
      return `| ${escapeMarkdownTableCell(entry.configuredSourceId)} | ${escapeMarkdownTableCell(`${entry.boardName} (${entry.adapter})`)} | ${escapeMarkdownTableCell(status)} | ${requestOrigin} | ${escapeMarkdownTableCell(entry.attribution)} |`;
    })
    .join("\n");

  return `${header}${rows}\n`;
}

function formatSourceStatus(stat: SourceStats | undefined): string {
  if (!stat) {
    return "not run";
  }
  if (stat.status === "skipped") {
    return `skipped (${stat.skipReason ?? "cadence"})`;
  }
  if (stat.status === "failure") {
    return "failure";
  }
  return "success";
}

function sourceTimingsSection(result: ScanRunResult): string {
  if (result.sourceStats.length === 0) {
    return "_No sources configured._\n";
  }

  const header =
    "| Source | Cadence (h) | Attempted (UTC) | Completed (UTC) | Duration (ms) | Fetched | Normalized | Quarantined | Matched |\n" +
    "|--------|------------:|-----------------|-----------------|--------------:|--------:|-----------:|------------:|--------:|\n";
  const cadenceById = new Map(
    result.sourceCatalog.map((entry) => [entry.configuredSourceId, entry.minPollHours]),
  );

  const rows = result.sourceStats
    .map((stat) => {
      return `| ${escapeMarkdownTableCell(stat.sourceId)} | ${cadenceById.get(stat.sourceId) ?? 0} | ${escapeMarkdownTableCell(stat.attemptedAt ?? "—")} | ${escapeMarkdownTableCell(stat.completedAt ?? "—")} | ${stat.durationMs} | ${stat.fetched} | ${stat.normalized} | ${stat.quarantined} | ${stat.matched} |`;
    })
    .join("\n");

  return `${header}${rows}\n`;
}

function quarantineSection(result: ScanRunResult): string {
  const lines: string[] = [];
  for (const stat of result.sourceStats) {
    if (!stat.quarantineDiagnostics || stat.quarantineDiagnostics.total === 0) {
      continue;
    }
    lines.push(`### ${escapeMarkdownTableCell(stat.sourceId)} (${stat.adapter})`);
    lines.push("");
    lines.push(
      `- Total quarantined: ${stat.quarantineDiagnostics.total}`,
    );
    if (Object.keys(stat.quarantineDiagnostics.byCategory).length > 0) {
      lines.push("- By category:");
      for (const [category, count] of Object.entries(stat.quarantineDiagnostics.byCategory)) {
        lines.push(`  - ${escapeMarkdownTableCell(category)}: ${count}`);
      }
    }
    if (Object.keys(stat.quarantineDiagnostics.byReason).length > 0) {
      lines.push("- By reason:");
      for (const [reason, count] of Object.entries(stat.quarantineDiagnostics.byReason)) {
        lines.push(`  - ${escapeMarkdownTableCell(reason)}: ${count}`);
      }
    }
    lines.push("");
  }

  if (lines.length === 0) {
    return "_No quarantined records this run._\n";
  }

  return `${lines.join("\n")}\n`;
}

function fetchErrorsSection(result: ScanRunResult): string {
  if (result.fetchErrors.length === 0) {
    return "_None._\n";
  }

  return result.fetchErrors
    .map((error) => {
      const parts = [
        `- **${escapeMarkdownTableCell(error.sourceId)} (${escapeMarkdownTableCell(error.adapter)}):** ${escapeMarkdownTableCell(error.error)}`,
      ];
      if (error.status !== undefined) {
        parts.push(`status=${error.status}`);
      }
      if (error.attempts !== undefined) {
        parts.push(`attempts=${error.attempts}`);
      }
      if (error.retryable !== undefined) {
        parts.push(`retryable=${error.retryable ? "yes" : "no"}`);
      }
      return parts.join(" — ");
    })
    .join("\n");
}

function exclusionsByReasonSection(result: ScanRunResult): string {
  const entries = Object.entries(result.exclusionsByReason);
  if (entries.length === 0) {
    return "_None._\n";
  }

  return entries
    .map(([reason, count]) => `- ${escapeMarkdownTableCell(reason)}: ${count}`)
    .join("\n");
}

function lifecycleSuppressionSection(result: ScanRunResult): string {
  const { applied, dismissed, expired } = result.lifecycleSuppressed;
  const total = applied + dismissed + expired;
  if (total === 0) {
    return "_No policy matches were suppressed by lifecycle state this run._\n";
  }

  return [
    `- Applied: ${applied}`,
    `- Dismissed: ${dismissed}`,
    `- Expired: ${expired}`,
    `- Total suppressed (policy-matched but hidden from active tables): ${total}`,
  ].join("\n");
}

function dedupeSection(result: ScanRunResult): string {
  const { inputCount, outputCount, mergedCount } = result.dedupeSummary;
  return [
    `- Pre-dedupe corpus size: ${inputCount}`,
    `- Post-dedupe corpus size: ${outputCount}`,
    `- Cross-source merges: ${mergedCount}`,
    `- Blocklisted before filter: ${result.blocklistExcluded}`,
  ].join("\n");
}

function countLines(result: ScanRunResult): string {
  const lifecycleTotal =
    result.lifecycleSuppressed.applied +
    result.lifecycleSuppressed.dismissed +
    result.lifecycleSuppressed.expired;

  return [
    `| Policy matched (after filters) | ${result.policyMatched} |`,
    `| Active matched (lifecycle-adjusted) | ${result.allMatched.length} |`,
    `| — Nigeria-eligible | ${countByGeo(result.allMatched, "nigeria_eligible")} |`,
    `| — Verify geo | ${countByGeo(result.allMatched, "verify_geo")} |`,
    `| Lifecycle suppressed (applied/dismissed/expired) | ${lifecycleTotal} |`,
    `| New this run | **${result.newJobs.length}** |`,
    `| Previously seen (still open) | ${result.previouslySeen.length} |`,
    `| Excluded by filter | ${result.excluded.length} |`,
    `| Source fetch errors | ${result.fetchErrors.length} |`,
  ].join("\n");
}

function excludedSampleSection(result: ScanRunResult): string {
  if (result.excluded.length === 0) {
    return "_None._\n";
  }

  return result.excluded
    .slice(0, 15)
    .map(
      (entry) =>
        `- ${escapeMarkdownTableCell(entry.posting.company)} — ${escapeMarkdownTableCell(entry.posting.title)}: ${escapeMarkdownTableCell(entry.reason)}`,
    )
    .join("\n");
}

export function renderScanReport(result: ScanRunResult): string {
  const policy = result.policy;
  const roleCriteria = policyCriteriaLines(policy);
  const configLabel = formatMarkdownCode(policy.configLabel);
  const filterLabel = `${policy.roleProfileLabel} + geo eligibility`;
  const statusByKey = buildStatusMap(result);
  const newNigeriaEligible = result.newJobs.filter(
    (job) => job.geoEligibility === "nigeria_eligible",
  );
  const newVerifyGeo = result.newJobs.filter((job) => job.geoEligibility === "verify_geo");
  const allNigeriaEligible = result.allMatched.filter(
    (job) => job.geoEligibility === "nigeria_eligible",
  );
  const allVerifyGeo = result.allMatched.filter((job) => job.geoEligibility === "verify_geo");
  const outcomeSummary = formatOutcomeSummary(result);
  const newSummary = formatNewSummary(result);
  const artifactLinks = [
    formatMarkdownCode(result.artifacts.report),
    formatMarkdownCode(result.artifacts.scanResult),
    formatMarkdownCode(result.artifacts.manifest),
  ].join(", ");

  return `# Job Scan Report

- **Scan date:** ${result.scanDate}
- **Run ID:** ${formatMarkdownCode(result.runId)}
- **Started (UTC):** ${result.startedAt}
- **Completed (UTC):** ${result.completedAt}
- **Duration:** ${result.durationMs} ms
- **Outcome:** ${outcomeSummary}
- **Primary output:** this Markdown file (${formatMarkdownCode(result.artifacts.report)}). Companion artifacts: ${artifactLinks}.
- **Configured sources:** ${result.sourceCatalog.map((entry) => entry.configuredSourceId).join(", ") || "none"}
- **Applicant geo:** ${escapeChecklistSegment(policy.applicant.citizenship)} citizen, work permit in ${policy.applicant.workPermitCountries.map(escapeChecklistSegment).join(", ")} only (${configLabel})
- **New this run:** ${newSummary}

**Criteria:**
${roleCriteria}
- **Nigeria-eligible:** global remote or explicit Nigeria/Africa/unrestricted hire signals
- **Verify geo:** EMEA or unclear remote — manual check before applying
- **Likely excluded:** EU/UK/US-only, hybrid/on-site, or Africa-excluded listings

---

## Run artifacts

| Artifact | File |
|----------|------|
| Report | ${formatMarkdownCode(`${result.runDirName}/${result.artifacts.report}`)} |
| Scan result | ${formatMarkdownCode(`${result.runDirName}/${result.artifacts.scanResult}`)} |
| Manifest | ${formatMarkdownCode(`${result.runDirName}/${result.artifacts.manifest}`)} |

---

## Source attribution

Listings below include data credited to each configured board. Remote OK and Remotive listings require link-back per board terms — see attribution column.

${sourceAttributionSection(result)}

---

## Effective scan policy

${policyJsonBlock(result)}

---

## Method

1. Fetch enabled public job boards from ${formatMarkdownCode("config/job-sources.json")} (no login required). Sources respect ${formatMarkdownCode("minPollHours")} cadence unless ${formatMarkdownCode("pnpm scan-jobs --force")} is used${result.forcePoll ? " (**--force** was used this run)" : ""}.
2. Normalize listings, deduplicate overlapping identities across configured sources, apply employer blocklist from ${configLabel}.
3. Filter for ${filterLabel} using the policy above.
4. Dedupe against profile-specific scan state and lifecycle state (\`applied\`, \`dismissed\`, \`expired\`) from prior report checkboxes.
5. LinkedIn discovery remains optional (${formatMarkdownCode("pnpm discover-linkedin")}) and separate from this scan.

---

## All matched — Nigeria-eligible

Prioritize these. **Status:** New = first time seen; Seen = still open from a prior scan. Counts are **active matched** (lifecycle-suppressed jobs are excluded).

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

## Source timings and cadence

${sourceTimingsSection(result)}

---

## Quarantine diagnostics

${quarantineSection(result)}

---

## Dedupe and blocklist

${dedupeSection(result)}

---

## Exclusions by reason

${exclusionsByReasonSection(result)}

---

## Lifecycle suppression

Policy-matched listings hidden because they are already applied, dismissed, or expired:

${lifecycleSuppressionSection(result)}

---

## Scan stats

| Metric | Count |
|--------|------:|
${countLines(result)}

---

## Fetch errors

${fetchErrorsSection(result)}

---

## Excluded sample (first 15)

Detailed exclusion counts are grouped by reason above. Sample rows:

${excludedSampleSection(result)}

---

## New listings — mark applied

Tick boxes after applying; the next ${formatMarkdownCode("pnpm scan-jobs")} run merges checked items into lifecycle state (v2 schema).

${appliedChecklist(result.newJobs)}

*Generated by refine-cv job scan pipeline.*
`;
}

export { boardDisplayName };
