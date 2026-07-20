import { fetchJson } from "../fetch.js";
import { decodeHtmlEntities, stripHtml } from "../normalize.js";
import type { RawPosting } from "../types.js";

interface RemoteOkJob {
  id?: string;
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

const CITY_LIKE_TITLE =
  /^(?:adelaide|nassau|berlin|london|paris|tokyo|sydney|toronto|remote|worldwide)$/i;

const ROLE_SIGNAL =
  /\b(developer|engineer|designer|frontend|front-end|react|software|full[- ]stack|web|typescript|javascript|ui|ux)\b/i;

const SPAM_DESCRIPTION =
  /beta feature to avoid spam applicants|there are no articles in this category/i;

export function validateRemoteOkJob(job: RemoteOkJob): { ok: boolean; reason?: string } {
  if (job.legal || job.last_updated !== undefined) {
    return { ok: false, reason: "metadata" };
  }

  const title = decodeHtmlEntities(job.position ?? "").trim();
  const company = decodeHtmlEntities(job.company ?? "").trim();
  const description = stripHtml(job.description ?? "");
  const location = decodeHtmlEntities(job.location ?? "").trim();

  if (!title || !company || !job.url) {
    return { ok: false, reason: "missing fields" };
  }

  if (title.length < 8 || CITY_LIKE_TITLE.test(title)) {
    return { ok: false, reason: "title looks like location" };
  }

  if (!ROLE_SIGNAL.test(`${title} ${description}`)) {
    return { ok: false, reason: "not a tech role" };
  }

  if (description.length < 80 || SPAM_DESCRIPTION.test(description)) {
    return { ok: false, reason: "low quality description" };
  }

  if (job.epoch) {
    const ageDays = (Date.now() - job.epoch * 1000) / (1000 * 60 * 60 * 24);
    if (ageDays > 120) {
      return { ok: false, reason: "stale listing" };
    }
  }

  if (!/\bremote\b/i.test(`${location} ${description}`) && !location) {
    return { ok: false, reason: "not remote" };
  }

  return { ok: true };
}

export function remoteOkJobToPosting(job: RemoteOkJob, attribution?: string): RawPosting {
  const title = decodeHtmlEntities(job.position ?? "");
  const company = decodeHtmlEntities(job.company ?? "");
  const description = stripHtml(job.description ?? "");
  const location = decodeHtmlEntities(job.location ?? "Remote");

  return {
    sourceId: "remoteok",
    sourceJobId: String(job.id ?? job.slug ?? `${company}-${title}`),
    company,
    title,
    url: job.apply_url ?? job.url ?? "",
    listingUrl: job.url ?? job.apply_url,
    location: location || "Remote",
    description,
    postedAt: job.date,
    attribution,
  };
}

export async function fetchRemoteOkRaw(attribution?: string): Promise<{
  postings: RawPosting[];
  quarantined: number;
}> {
  const jobs = await fetchJson<RemoteOkJob[]>("https://remoteok.com/api");
  const postings: RawPosting[] = [];
  let quarantined = 0;

  for (const job of jobs) {
    const validation = validateRemoteOkJob(job);
    if (!validation.ok) {
      quarantined += 1;
      continue;
    }
    postings.push(remoteOkJobToPosting(job, attribution));
  }

  return { postings, quarantined };
}
