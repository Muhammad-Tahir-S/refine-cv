import type { JobSourceEntry, RawPosting } from "../types.js";

export interface BoardFetchResult {
  sourceId: string;
  adapter: string;
  postings: RawPosting[];
  quarantined: number;
}

export interface JobBoardAdapter {
  id: JobSourceEntry["adapter"];
  fetch(source: JobSourceEntry): Promise<BoardFetchResult>;
}

export interface BoardAdapterContext {
  fetchedAt: string;
}
