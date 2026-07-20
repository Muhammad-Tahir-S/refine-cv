import { fetchJson } from "../fetch.js";
import { stripHtml } from "../normalize.js";
import type { JobSourceEntry, RawPosting } from "../types.js";
import type { BoardFetchResult, JobBoardAdapter } from "./types.js";

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description?: string;
  remote?: boolean;
  url: string;
  location?: string;
  created_at?: number;
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[];
}

export const arbeitnowAdapter: JobBoardAdapter = {
  id: "arbeitnow",
  async fetch(source: JobSourceEntry): Promise<BoardFetchResult> {
    const postings: RawPosting[] = [];
    const maxPages = source.maxPages ?? 3;

    for (let page = 1; page <= maxPages; page += 1) {
      const url = `https://www.arbeitnow.com/api/job-board-api?page=${page}`;
      const response = await fetchJson<ArbeitnowResponse>(url);
      const jobs = response.data ?? [];
      if (jobs.length === 0) {
        break;
      }

      for (const job of jobs) {
        postings.push({
          sourceId: "arbeitnow",
          sourceJobId: job.slug,
          company: job.company_name,
          title: job.title,
          url: job.url,
          listingUrl: job.url,
          location: job.remote ? "Remote" : (job.location ?? "Unknown"),
          description: stripHtml(job.description ?? ""),
          postedAt: job.created_at ? new Date(job.created_at * 1000).toISOString() : undefined,
          attribution: source.attribution,
        });
      }

      if (jobs.length < 100) {
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
