import { fetchJson } from "../fetch.js";
import { stripHtml } from "../normalize.js";
import type { JobSourceEntry, RawPosting } from "../types.js";
import type { BoardFetchResult, JobBoardAdapter } from "./types.js";

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
}

interface JobicyResponse {
  jobs: JobicyJob[];
}

export const jobicyAdapter: JobBoardAdapter = {
  id: "jobicy",
  async fetch(source: JobSourceEntry): Promise<BoardFetchResult> {
    const count = source.count ?? 100;
    const tag = source.tag ?? "react";
    const url = `https://jobicy.com/api/v2/remote-jobs?count=${count}&tag=${encodeURIComponent(tag)}`;
    const response = await fetchJson<JobicyResponse>(url);

    const postings: RawPosting[] = (response.jobs ?? []).map((job) => ({
      sourceId: "jobicy",
      sourceJobId: String(job.id),
      company: job.companyName,
      title: job.jobTitle,
      url: job.url,
      listingUrl: job.url,
      location: job.jobGeo ?? "Remote",
      description: stripHtml(job.jobDescription ?? job.jobExcerpt ?? ""),
      postedAt: job.pubDate,
      attribution: source.attribution,
    }));

    return {
      sourceId: source.id,
      adapter: source.adapter,
      postings,
      quarantined: 0,
    };
  },
};
