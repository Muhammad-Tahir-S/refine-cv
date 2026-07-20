import { fetchJson } from "../fetch.js";
import { stripHtml } from "../normalize.js";
import type { JobSourceEntry, RawPosting } from "../types.js";
import type { BoardFetchResult, JobBoardAdapter } from "./types.js";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  publication_date?: string;
  description?: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

export const remotiveAdapter: JobBoardAdapter = {
  id: "remotive",
  async fetch(source: JobSourceEntry): Promise<BoardFetchResult> {
    const params = new URLSearchParams();
    if (source.search) {
      params.set("search", source.search);
    }
    if (source.category) {
      params.set("category", source.category);
    }
    params.set("limit", "100");

    const url = `https://remotive.com/api/remote-jobs?${params.toString()}`;
    const response = await fetchJson<RemotiveResponse>(url);

    const postings: RawPosting[] = (response.jobs ?? []).map((job) => ({
      sourceId: "remotive",
      sourceJobId: String(job.id),
      company: job.company_name,
      title: job.title,
      url: job.url,
      listingUrl: job.url,
      location: job.candidate_required_location ?? "Remote",
      description: stripHtml(job.description ?? ""),
      postedAt: job.publication_date,
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
