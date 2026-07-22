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

export interface HimalayasJob {
  guid?: string;
  title?: string;
  companyName?: string;
  description?: string;
  excerpt?: string;
  applicationLink?: string;
  pubDate?: string;
  locationRestrictions?: string[] | null;
}

export interface HimalayasResponse {
  jobs?: HimalayasJob[];
  totalCount?: number;
  limit?: number;
  offset?: number;
}

const PAGE_LIMIT = 20;
const MAX_PAGES = 10;

export function buildHimalayasRequestUrl(
  source: Pick<JobSourceEntry, "query" | "worldwide">,
  offset: number,
): string {
  const query = encodeURIComponent(source.query ?? "remote software");
  const worldwide = source.worldwide ?? true;
  const limit = PAGE_LIMIT;
  return (
    `https://himalayas.app/jobs/api/search?q=${query}` +
    `&worldwide=${worldwide ? "true" : "false"}&sort=recent&limit=${limit}&offset=${offset}`
  );
}

export function parseHimalayasJob(
  value: unknown,
  attribution?: string,
): { posting?: RawPosting; reason?: string; category?: "malformed" | "missing_fields" } {
  if (!isRecord(value)) {
    return { reason: "record is not an object", category: "malformed" };
  }
  const job = value as HimalayasJob;
  const title = typeof job.title === "string" ? job.title.trim() : "";
  const company =
    typeof job.companyName === "string" ? job.companyName.trim() : "";
  if (!title || !company) {
    return { reason: "missing title or company", category: "missing_fields" };
  }

  if (
    job.locationRestrictions != null &&
    (!Array.isArray(job.locationRestrictions) ||
      !job.locationRestrictions.every((entry) => typeof entry === "string"))
  ) {
    return { reason: "invalid location restrictions", category: "malformed" };
  }
  const location =
    job.locationRestrictions == null || job.locationRestrictions.length === 0
      ? "Worldwide"
      : job.locationRestrictions.join(", ");
  const applicationLink =
    typeof job.applicationLink === "string" ? job.applicationLink : undefined;
  const description =
    typeof job.description === "string"
      ? job.description
      : typeof job.excerpt === "string"
        ? job.excerpt
        : "";

  return {
    posting: {
      sourceId: "himalayas",
      sourceJobId:
        typeof job.guid === "string" ? job.guid : `${company}-${title}`,
      company,
      title,
      url:
        applicationLink ??
        `https://himalayas.app/jobs/${encodeURIComponent(title)}`,
      listingUrl: applicationLink,
      location,
      description: stripHtml(description),
      postedAt: typeof job.pubDate === "string" ? job.pubDate : undefined,
      attribution,
    },
  };
}

export function parseHimalayasResponse(
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
  const jobs = requireArrayField(response, "jobs", "Himalayas");

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const parsed = parseHimalayasJob(job, attribution);
    if (!parsed.posting) {
      collector.record(
        parsed.reason ?? "invalid record",
        parsed.category ?? "malformed",
        safeRecordSample(job, ["guid"], ["title"]),
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

export async function fetchHimalayasRaw(
  source: Pick<JobSourceEntry, "query" | "worldwide" | "maxPages" | "attribution">,
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

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * PAGE_LIMIT;
    const requestUrl = buildHimalayasRequestUrl(source, offset);
    requestUrls.push(requestUrl);
    const response = await fetchJson<unknown>(requestUrl);
    const jobs = requireArrayField(response, "jobs", "Himalayas");
    if (jobs.length === 0) {
      break;
    }

    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      const parsed = parseHimalayasJob(job, source.attribution);
      if (!parsed.posting) {
        collector.record(
          parsed.reason ?? "invalid record",
          parsed.category ?? "malformed",
          safeRecordSample(job, ["guid"], ["title"]),
          offset + index,
        );
        continue;
      }
      postings.push(parsed.posting);
    }

    if (jobs.length < PAGE_LIMIT) {
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

export const himalayasAdapter: JobBoardAdapter = {
  id: "himalayas",
  async fetch(source: JobSourceEntry, _context: BoardFetchContext): Promise<BoardFetchResult> {
    const { postings, quarantined, quarantineDiagnostics, requestUrls } =
      await fetchHimalayasRaw(source);
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

export function emptyHimalayasParseResult() {
  return {
    postings: [],
    quarantined: 0,
    quarantineDiagnostics: emptyQuarantineDiagnostics(),
  };
}
