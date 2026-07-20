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

export interface JobicyJob {
  id?: number;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  jobGeo?: string | null;
  jobLevel?: string | null;
  jobExcerpt?: string | null;
  jobDescription?: string | null;
  pubDate?: string | null;
}

export interface JobicyResponse {
  jobs?: JobicyJob[];
}

const MAX_COUNT = 200;

export function buildJobicyRequestUrl(source: Pick<JobSourceEntry, "tag" | "count">): string {
  const count = Math.min(source.count ?? 100, MAX_COUNT);
  const tag = source.tag ?? "remote";
  return `https://jobicy.com/api/v2/remote-jobs?count=${count}&tag=${encodeURIComponent(tag)}`;
}

export function parseJobicyJob(
  value: unknown,
  attribution?: string,
): { posting?: RawPosting; reason?: string; category?: "malformed" | "missing_fields" } {
  if (!isRecord(value)) {
    return { reason: "record is not an object", category: "malformed" };
  }
  const job = value as JobicyJob;
  if (
    typeof job.id !== "number" ||
    typeof job.url !== "string" ||
    typeof job.jobTitle !== "string" ||
    typeof job.companyName !== "string" ||
    !job.url ||
    !job.jobTitle.trim() ||
    !job.companyName.trim()
  ) {
    return { reason: "missing or invalid required fields", category: "missing_fields" };
  }

  return {
    posting: {
      sourceId: "jobicy",
      sourceJobId: String(job.id),
      company: job.companyName.trim(),
      title: job.jobTitle.trim(),
      url: job.url,
      listingUrl: job.url,
      location:
        typeof job.jobGeo === "string" && job.jobGeo.trim()
          ? job.jobGeo.trim()
          : "Remote",
      description: stripHtml(
        typeof job.jobDescription === "string"
          ? job.jobDescription
          : typeof job.jobExcerpt === "string"
            ? job.jobExcerpt
            : "",
      ),
      postedAt: typeof job.pubDate === "string" ? job.pubDate : undefined,
      attribution,
    },
  };
}

export function parseJobicyResponse(
  response: unknown,
  attribution?: string,
): {
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics: QuarantineDiagnostics;
} {
  const collector = new QuarantineCollector();
  const postings: RawPosting[] = [];
  const jobs = requireArrayField(response, "jobs", "Jobicy");

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const parsed = parseJobicyJob(job, attribution);
    if (!parsed.posting) {
      collector.record(
        parsed.reason ?? "invalid record",
        parsed.category ?? "malformed",
        safeRecordSample(job, ["id"], ["jobTitle"]),
        index,
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

export async function fetchJobicyRaw(
  source: Pick<JobSourceEntry, "tag" | "count" | "attribution">,
): Promise<{
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics: QuarantineDiagnostics;
  requestUrl: string;
}> {
  const requestUrl = buildJobicyRequestUrl(source);
  const response = await fetchJson<unknown>(requestUrl);
  const parsed = parseJobicyResponse(response, source.attribution);
  return { ...parsed, requestUrl };
}

export const jobicyAdapter: JobBoardAdapter = {
  id: "jobicy",
  async fetch(source: JobSourceEntry, _context: BoardFetchContext): Promise<BoardFetchResult> {
    const { postings, quarantined, quarantineDiagnostics, requestUrl } =
      await fetchJobicyRaw(source);
    return {
      sourceId: source.id,
      adapter: source.adapter,
      postings,
      quarantined,
      quarantineDiagnostics,
      requestUrls: [requestUrl],
      attribution: source.attribution,
    };
  },
};

export function emptyJobicyParseResult() {
  return {
    postings: [],
    quarantined: 0,
    quarantineDiagnostics: emptyQuarantineDiagnostics(),
  };
}
