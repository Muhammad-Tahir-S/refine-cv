import { arbeitnowAdapter } from "./arbeitnow.js";
import { himalayasAdapter } from "./himalayas.js";
import { hnHiringAdapter } from "./hn-hiring.js";
import { jobicyAdapter } from "./jobicy.js";
import { remoteokAdapter } from "./remoteok-adapter.js";
import { remotiveAdapter } from "./remotive.js";
import type { JobBoardAdapter } from "./types.js";
import { wwrAdapter } from "./wwr.js";

const ADAPTERS: Record<string, JobBoardAdapter> = {
  himalayas: himalayasAdapter,
  jobicy: jobicyAdapter,
  remotive: remotiveAdapter,
  arbeitnow: arbeitnowAdapter,
  remoteok: remoteokAdapter,
  wwr: wwrAdapter,
  "hn-hiring": hnHiringAdapter,
};

export function getBoardAdapter(adapter: string): JobBoardAdapter {
  const board = ADAPTERS[adapter];
  if (!board) {
    throw new Error(`Unknown job board adapter: ${adapter}`);
  }
  return board;
}

export { arbeitnowAdapter, himalayasAdapter, hnHiringAdapter, jobicyAdapter, remoteokAdapter, remotiveAdapter, wwrAdapter };
export type { BoardFetchResult, JobBoardAdapter } from "./types.js";
