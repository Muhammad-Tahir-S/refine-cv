import type { QuarantineDiagnostics } from "../types.js";
import type { JobSourceEntry, RawPosting } from "../types.js";
import type { RoleProfile } from "../role-profile.js";

export interface BoardFetchResult {
  sourceId: string;
  adapter: string;
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics?: QuarantineDiagnostics;
  requestUrls: string[];
  /** @deprecated Adapters should populate requestUrls. */
  requestUrl?: string;
  attribution?: string;
}

export interface BoardFetchContext {
  roleProfile: RoleProfile;
}

export interface JobBoardAdapter {
  id: JobSourceEntry["adapter"];
  fetch(source: JobSourceEntry, context: BoardFetchContext): Promise<BoardFetchResult>;
}

export interface BoardAdapterContext {
  fetchedAt: string;
}
