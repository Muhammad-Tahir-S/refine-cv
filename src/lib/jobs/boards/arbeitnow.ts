import { fetchJson } from "../fetch.js";
import { stripHtml } from "../normalize.js";
import type { JobSourceEntry, RawPosting } from "../types.js";
import {
  emptyQuarantineDiagnostics,
  isRecord,
  QuarantineCollector,
  requireArrayField,
  safeRecordSample,
  type QuarantineDiagnostics,
} from "./quarantine.js";
import type { BoardFetchContext, BoardFetchResult, JobBoardAdapter } from "./types.js";

export interface ArbeitnowJob {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string | null;
  remote?: boolean | null;
  url?: string;
  location?: string | null;
  created_at?: number | null;
}

export interface ArbeitnowResponse {
  data?: ArbeitnowJob[];
}

const MAX_PAGES = 10;

export function buildArbeitnowRequestUrl(page: number): string {
  const safePage = Math.max(1, Math.min(page, MAX_PAGES));
  return `https://www.arbeitnow.com/api/job-board-api?page=${safePage}`;
}

export function parseArbeitnowJob(
  value: unknown,
  attribution?: string,
): { posting?: RawPosting; reason?: string; category?: "malformed" | "missing_fields" } {
  if (!isRecord(value)) {
    return { reason: "record is not an object", category: "malformed" };
  }
  const job = value as ArbeitnowJob;
  if (
    typeof job.slug !== "string" ||
    typeof job.url !== "string" ||
    typeof job.title !== "string" ||
    typeof job.company_name !== "string" ||
    !job.slug ||
    !job.url ||
    !job.title.trim() ||
    !job.company_name.trim()
  ) {
    return { reason: "missing or invalid required fields", category: "missing_fields" };
  }

  return {
    posting: {
      sourceId: "arbeitnow",
      sourceJobId: job.slug,
      company: job.company_name.trim(),
      title: job.title.trim(),
      url: job.url,
      listingUrl: job.url,
      location:
        job.remote === true
          ? "Remote"
          : typeof job.location === "string" && job.location.trim()
            ? job.location.trim()
            : "Unknown",
      description: stripHtml(
        typeof job.description === "string" ? job.description : "",
      ),
      postedAt:
        typeof job.created_at === "number" &&
        Number.isFinite(job.created_at) &&
        job.created_at >= 0 &&
        job.created_at <= 253_402_300_799
          ? new Date(job.created_at * 1000).toISOString()
          : undefined,
      attribution,
    },
  };
}

export function parseArbeitnowResponse(
  response: unknown,
  attribution?: string,
  startIndex = 0,
): {
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics: QuarantineDiagnostics;
} {
  const collector = new QuarantineCollector();
  const postings: RawPosting[] = [];
  const jobs = requireArrayField(response, "data", "Arbeitnow");

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const parsed = parseArbeitnowJob(job, attribution);
    if (!parsed.posting) {
      collector.record(
        parsed.reason ?? "invalid record",
        parsed.category ?? "malformed",
        safeRecordSample(job, ["slug"], ["title"]),
        startIndex + index,
      );
      continue;
    }
    postings.push(parsed.posting);
  }

  const quarantineDiagnostics = collector.toDiagnostics();
  return {
    postings,
    quarantined: quarantineDiagnostics.total,
    quarantineDiagnostics,
  };
}

export async function fetchArbeitnowRaw(
  source: Pick<JobSourceEntry, "maxPages" | "attribution">,
): Promise<{
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics: QuarantineDiagnostics;
  requestUrls: string[];
}> {
  const postings: RawPosting[] = [];
  const collector = new QuarantineCollector();
  const maxPages = Math.min(source.maxPages ?? 3, MAX_PAGES);
  const requestUrls: string[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const requestUrl = buildArbeitnowRequestUrl(page);
    requestUrls.push(requestUrl);
    const response = await fetchJson<unknown>(requestUrl);
    const jobs = requireArrayField(response, "data", "Arbeitnow");
    if (jobs.length === 0) {
      break;
    }

    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      const parsed = parseArbeitnowJob(job, source.attribution);
      if (!parsed.posting) {
        collector.record(
          parsed.reason ?? "invalid record",
          parsed.category ?? "malformed",
          safeRecordSample(job, ["slug"], ["title"]),
          index,
        );
        continue;
      }
      postings.push(parsed.posting);
    }

    if (jobs.length < 100) {
      break;
    }
  }

  const quarantineDiagnostics = collector.toDiagnostics();
  return {
    postings,
    quarantined: quarantineDiagnostics.total,
    quarantineDiagnostics,
    requestUrls,
  };
}

export const arbeitnowAdapter: JobBoardAdapter = {
  id: "arbeitnow",
  async fetch(source: JobSourceEntry, _context: BoardFetchContext): Promise<BoardFetchResult> {
    const { postings, quarantined, quarantineDiagnostics, requestUrls } =
      await fetchArbeitnowRaw(source);
    return {
      sourceId: source.id,
      adapter: source.adapter,
      postings,
      quarantined,
      quarantineDiagnostics,
      requestUrls,
      attribution: source.attribution,
    };
  },
};

export function emptyArbeitnowParseResult() {
  return {
    postings: [],
    quarantined: 0,
    quarantineDiagnostics: emptyQuarantineDiagnostics(),
  };
}
