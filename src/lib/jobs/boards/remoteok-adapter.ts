import type { JobSourceEntry } from "../types.js";
import { fetchRemoteOkRaw } from "./remoteok.js";
import type { BoardFetchResult, JobBoardAdapter } from "./types.js";

export const remoteokAdapter: JobBoardAdapter = {
  id: "remoteok",
  async fetch(source: JobSourceEntry): Promise<BoardFetchResult> {
    const { postings, quarantined } = await fetchRemoteOkRaw(source.attribution);
    return {
      sourceId: source.id,
      adapter: source.adapter,
      postings,
      quarantined,
    };
  },
};

export { validateRemoteOkJob, remoteOkJobToPosting } from "./remoteok.js";
