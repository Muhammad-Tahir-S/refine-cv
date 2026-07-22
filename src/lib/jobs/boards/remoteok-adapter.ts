import type { JobSourceEntry } from "../types.js";
import { fetchRemoteOkRaw } from "./remoteok.js";
import type { BoardFetchContext, BoardFetchResult, JobBoardAdapter } from "./types.js";

export const remoteokAdapter: JobBoardAdapter = {
  id: "remoteok",
  async fetch(source: JobSourceEntry, _context: BoardFetchContext): Promise<BoardFetchResult> {
    const { postings, quarantined, quarantineDiagnostics, requestUrl } =
      await fetchRemoteOkRaw(source);
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

export {
  buildRemoteOkRequestUrl,
  isRemoteOkMetadataRecord,
  parseRemoteOkResponse,
  remoteOkJobToPosting,
  validateRemoteOkJob,
} from "./remoteok.js";
