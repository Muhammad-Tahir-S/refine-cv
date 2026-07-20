import { fetchJson } from "../fetch.js";
import { stripHtml } from "../normalize.js";
import type { JobSourceEntry, RawPosting } from "../types.js";
import type { BoardFetchResult, JobBoardAdapter } from "./types.js";

interface HimalayasJob {
  guid?: string;
  title: string;
  companyName: string;
  description?: string;
  excerpt?: string;
  applicationLink?: string;
  pubDate?: string;
  locationRestrictions?: string[];
}

interface HimalayasResponse {
  jobs: HimalayasJob[];
  totalCount?: number;
  limit?: number;
  offset?: number;
}

export const himalayasAdapter: JobBoardAdapter = {
  id: "himalayas",
  async fetch(source: JobSourceEntry): Promise<BoardFetchResult> {
    const postings: RawPosting[] = [];
    const limit = 20;
    const maxPages = source.maxPages ?? 3;
    const query = encodeURIComponent(source.query ?? "react frontend");
    const worldwide = source.worldwide ?? true;

    for (let page = 0; page < maxPages; page += 1) {
      const offset = page * limit;
      const url =
        `https://himalayas.app/jobs/api/search?q=${query}` +
        `&worldwide=${worldwide ? "true" : "false"}&sort=recent&limit=${limit}&offset=${offset}`;
      const response = await fetchJson<HimalayasResponse>(url);
      if (!response.jobs?.length) {
        break;
      }

      for (const job of response.jobs) {
        const location =
          job.locationRestrictions?.length === 0
            ? "Worldwide"
            : (job.locationRestrictions?.join(", ") ?? "Remote");
        postings.push({
          sourceId: "himalayas",
          sourceJobId: job.guid ?? `${job.companyName}-${job.title}`,
          company: job.companyName,
          title: job.title,
          url: job.applicationLink ?? `https://himalayas.app/jobs/${encodeURIComponent(job.title)}`,
          listingUrl: job.applicationLink,
          location,
          description: stripHtml(job.description ?? job.excerpt ?? ""),
          postedAt: job.pubDate,
          attribution: source.attribution,
        });
      }

      if (response.jobs.length < limit) {
        break;
      }
    }

    return {
      sourceId: source.id,
      adapter: source.adapter,
      postings,
      quarantined: 0,
    };
  },
};
