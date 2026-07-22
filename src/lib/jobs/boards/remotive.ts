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

export interface RemotiveJob {
  id?: number;
  url?: string;
  title?: string;
  company_name?: string;
  candidate_required_location?: string | null;
  publication_date?: string | null;
  description?: string | null;
}

export interface RemotiveResponse {
  jobs?: RemotiveJob[];
}

const MAX_LIMIT = 100;

export function buildRemotiveRequestUrl(
  source: Pick<JobSourceEntry, "search" | "category">,
): string {
  const params = new URLSearchParams();
  if (source.search) {
    params.set("search", source.search);
  }
  if (source.category) {
    params.set("category", source.category);
  }
  params.set("limit", String(MAX_LIMIT));
  return `https://remotive.com/api/remote-jobs?${params.toString()}`;
}

export function parseRemotiveJob(
  value: unknown,
  attribution?: string,
): { posting?: RawPosting; reason?: string; category?: "malformed" | "missing_fields" } {
  if (!isRecord(value)) {
    return { reason: "record is not an object", category: "malformed" };
  }
  const job = value as RemotiveJob;
  if (
    typeof job.id !== "number" ||
    typeof job.url !== "string" ||
    typeof job.title !== "string" ||
    typeof job.company_name !== "string" ||
    !job.url ||
    !job.title.trim() ||
    !job.company_name.trim()
  ) {
    return { reason: "missing or invalid required fields", category: "missing_fields" };
  }

  return {
    posting: {
      sourceId: "remotive",
      sourceJobId: String(job.id),
      company: job.company_name.trim(),
      title: job.title.trim(),
      url: job.url,
      listingUrl: job.url,
      location:
        typeof job.candidate_required_location === "string" &&
        job.candidate_required_location.trim()
          ? job.candidate_required_location.trim()
          : "Remote",
      description: stripHtml(
        typeof job.description === "string" ? job.description : "",
      ),
      postedAt:
        typeof job.publication_date === "string"
          ? job.publication_date
          : undefined,
      attribution,
    },
  };
}

export function parseRemotiveResponse(
  response: unknown,
  attribution?: string,
): {
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics: QuarantineDiagnostics;
} {
  const collector = new QuarantineCollector();
  const postings: RawPosting[] = [];
  const jobs = requireArrayField(response, "jobs", "Remotive");

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const parsed = parseRemotiveJob(job, attribution);
    if (!parsed.posting) {
      collector.record(
        parsed.reason ?? "invalid record",
        parsed.category ?? "malformed",
        safeRecordSample(job, ["id"], ["title"]),
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

export async function fetchRemotiveRaw(
  source: Pick<JobSourceEntry, "search" | "category" | "attribution">,
): Promise<{
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics: QuarantineDiagnostics;
  requestUrl: string;
}> {
  const requestUrl = buildRemotiveRequestUrl(source);
  const response = await fetchJson<unknown>(requestUrl);
  const parsed = parseRemotiveResponse(response, source.attribution);
  return { ...parsed, requestUrl };
}

export const remotiveAdapter: JobBoardAdapter = {
  id: "remotive",
  async fetch(source: JobSourceEntry, _context: BoardFetchContext): Promise<BoardFetchResult> {
    const { postings, quarantined, quarantineDiagnostics, requestUrl } =
      await fetchRemotiveRaw(source);
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

export function emptyRemotiveParseResult() {
  return {
    postings: [],
    quarantined: 0,
    quarantineDiagnostics: emptyQuarantineDiagnostics(),
  };
}
