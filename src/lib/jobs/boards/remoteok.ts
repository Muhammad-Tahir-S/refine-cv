import { fetchJson } from "../fetch.js";
import { decodeHtmlEntities, stripHtml } from "../normalize.js";
import type { JobSourceEntry, RawPosting } from "../types.js";
import {
  emptyQuarantineDiagnostics,
  isRecord,
  QuarantineCollector,
  safeRecordSample,
  type QuarantineDiagnostics,
} from "./quarantine.js";
import type { BoardFetchResult } from "./types.js";

export interface RemoteOkJob {
  id?: string | number;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  url?: string;
  apply_url?: string;
  legal?: string;
  last_updated?: number;
}

const SPAM_DESCRIPTION =
  /beta feature to avoid spam applicants|there are no articles in this category/i;

export function isRemoteOkMetadataRecord(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const job = value as RemoteOkJob;
  if (job.legal) {
    return true;
  }

  const hasJobIdentity =
    Boolean(job.id) ||
    Boolean(job.slug) ||
    (typeof job.position === "string" && Boolean(job.position.trim())) ||
    (typeof job.company === "string" && Boolean(job.company.trim()));

  return !hasJobIdentity && job.last_updated !== undefined;
}

export function validateRemoteOkJob(value: unknown): { ok: boolean; reason?: string; category?: "missing_fields" | "malformed" | "low_quality" } {
  if (!isRecord(value)) {
    return { ok: false, reason: "record is not an object", category: "malformed" };
  }
  const job = value as RemoteOkJob;
  const title =
    typeof job.position === "string"
      ? decodeHtmlEntities(job.position).trim()
      : "";
  const company =
    typeof job.company === "string"
      ? decodeHtmlEntities(job.company).trim()
      : "";
  const description =
    typeof job.description === "string" ? stripHtml(job.description) : "";

  if (!title || !company || typeof job.url !== "string" || !job.url) {
    return { ok: false, reason: "missing required fields", category: "missing_fields" };
  }

  if (SPAM_DESCRIPTION.test(description)) {
    return { ok: false, reason: "known spam description", category: "low_quality" };
  }

  return { ok: true };
}

export function remoteOkJobToPosting(job: RemoteOkJob, attribution?: string): RawPosting {
  const title = decodeHtmlEntities(
    typeof job.position === "string" ? job.position : "",
  );
  const company = decodeHtmlEntities(
    typeof job.company === "string" ? job.company : "",
  );
  const description = stripHtml(
    typeof job.description === "string" ? job.description : "",
  );
  const location = decodeHtmlEntities(
    typeof job.location === "string" ? job.location : "Remote",
  );
  const applyUrl = typeof job.apply_url === "string" ? job.apply_url : undefined;
  const listingUrl = typeof job.url === "string" ? job.url : undefined;

  return {
    sourceId: "remoteok",
    sourceJobId: String(job.id ?? job.slug ?? `${company}-${title}`),
    company,
    title,
    url: applyUrl ?? listingUrl ?? "",
    listingUrl: listingUrl ?? applyUrl,
    location: location || "Remote",
    description,
    postedAt: typeof job.date === "string" ? job.date : undefined,
    attribution,
  };
}

export function buildRemoteOkRequestUrl(source: Pick<JobSourceEntry, "tags">): string {
  const tags = (source.tags ?? "dev")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(",");
  return tags
    ? `https://remoteok.com/api?tags=${encodeURIComponent(tags).replaceAll("%2C", ",")}`
    : "https://remoteok.com/api";
}

export function parseRemoteOkResponse(
  value: unknown,
  attribution?: string,
): {
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics: QuarantineDiagnostics;
} {
  const collector = new QuarantineCollector();
  const postings: RawPosting[] = [];
  if (!Array.isArray(value)) {
    throw new Error("Remote OK response must be an array");
  }
  const jobs = value;

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    if (isRemoteOkMetadataRecord(job)) {
      continue;
    }

    const validation = validateRemoteOkJob(job);
    if (!validation.ok) {
      collector.record(
        validation.reason ?? "invalid record",
        validation.category ?? "malformed",
        safeRecordSample(job, ["id", "slug"], ["position"]),
        index,
      );
      continue;
    }

    postings.push(remoteOkJobToPosting(job as RemoteOkJob, attribution));
  }

  const quarantineDiagnostics = collector.toDiagnostics();
  return {
    postings,
    quarantined: quarantineDiagnostics.total,
    quarantineDiagnostics,
  };
}

export async function fetchRemoteOkRaw(
  source: Pick<JobSourceEntry, "tags" | "attribution">,
): Promise<{
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics: QuarantineDiagnostics;
  requestUrl: string;
}> {
  const requestUrl = buildRemoteOkRequestUrl(source);
  const jobs = await fetchJson<unknown>(requestUrl);
  const parsed = parseRemoteOkResponse(jobs, source.attribution);
  return {
    ...parsed,
    requestUrl,
  };
}

export function emptyRemoteOkParseResult(): {
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics: QuarantineDiagnostics;
} {
  return {
    postings: [],
    quarantined: 0,
    quarantineDiagnostics: emptyQuarantineDiagnostics(),
  };
}
