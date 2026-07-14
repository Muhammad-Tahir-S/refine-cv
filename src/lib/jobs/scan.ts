import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { paths } from "../paths.js";
import { fetchCompanyJobs } from "./ats/index.js";
import { filterPostings } from "./filter.js";
import { renderScanReport } from "./report.js";
import {
  loadScanState,
  saveMergedAppliedFromReports,
  saveScanState,
  updateScanState,
} from "./state.js";
import type {
  CompaniesConfig,
  CompanyEntry,
  JobPosting,
  ScanRunResult,
  ScanStateEntry,
} from "./types.js";

const CompanyEntrySchema = z.object({
  name: z.string(),
  ats: z.enum(["greenhouse", "lever", "ashby", "workable", "custom"]),
  slug: z.string(),
  careersUrl: z.string().optional(),
  greenhouseHost: z.string().optional(),
  notes: z.string().optional(),
});

const CompaniesConfigSchema = z.object({
  companies: z.array(CompanyEntrySchema),
  blocklist: z.array(z.string()),
});

export function loadCompaniesConfig(): CompaniesConfig {
  const configPath = paths.companiesConfig;
  if (!existsSync(configPath)) {
    throw new Error(`Missing companies registry: ${configPath}`);
  }
  return CompaniesConfigSchema.parse(
    JSON.parse(readFileSync(configPath, "utf8")),
  );
}

function todaySlug(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runJobScan(): Promise<ScanRunResult> {
  const config = loadCompaniesConfig();
  const appliedState = saveMergedAppliedFromReports(paths.jobsDir);
  let scanState = loadScanState();

  const allRaw: JobPosting[] = [];
  const fetchErrors: Array<{ company: string; error: string }> = [];

  for (const company of config.companies) {
    try {
      const jobs = await fetchCompanyJobs(company);
      allRaw.push(...jobs);
    } catch (error) {
      fetchErrors.push({
        company: company.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const { matched, excluded } = filterPostings(allRaw);

  const newJobs: JobPosting[] = [];
  const previouslySeen: JobPosting[] = [];
  const stateEntries: ScanStateEntry[] = [];

  for (const posting of matched) {
    stateEntries.push({
      dedupeKey: posting.dedupeKey,
      company: posting.company,
      title: posting.title,
      url: posting.url,
      firstSeenAt: scanState.seen[posting.dedupeKey]?.firstSeenAt ?? posting.fetchedAt,
      lastSeenAt: posting.fetchedAt,
    });

    const isApplied = Boolean(appliedState.applied[posting.dedupeKey]);
    const wasSeen = Boolean(scanState.seen[posting.dedupeKey]);

    if (isApplied) {
      continue;
    }

    if (wasSeen) {
      previouslySeen.push(posting);
    } else {
      newJobs.push(posting);
    }
  }

  scanState = updateScanState(scanState, stateEntries);
  saveScanState(scanState);

  const scanDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const outputDir = join(paths.jobsDir, `${todaySlug()}-job-scan`);
  mkdirSync(outputDir, { recursive: true });

  const result: ScanRunResult = {
    scanDate,
    outputDir,
    allMatched: matched,
    newJobs,
    previouslySeen,
    excluded,
    fetchErrors,
  };

  writeFileSync(join(outputDir, "raw.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(outputDir, "report.md"), renderScanReport(result));

  return result;
}

export function getCompanyNames(config: CompaniesConfig = loadCompaniesConfig()): string[] {
  return config.companies.map((c) => c.name);
}

export function getBlocklist(config: CompaniesConfig = loadCompaniesConfig()): string[] {
  return config.blocklist;
}

export type { CompanyEntry, CompaniesConfig };
