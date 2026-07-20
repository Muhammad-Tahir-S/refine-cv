import { fetchJson } from "../fetch.js";
import { decodeHtmlEntities, stripHtml } from "../normalize.js";
import type { JobSourceEntry, RawPosting } from "../types.js";
import {
  emptyQuarantineDiagnostics,
  isRecord,
  QuarantineCollector,
  requireArrayField,
  safeRecordSample,
  type QuarantineDiagnostics,
} from "./quarantine.js";
import type { BoardFetchContext, BoardFetchResult, JobBoardAdapter } from "./types.js";

export interface HnSearchHit {
  objectID: string;
  title: string;
  created_at?: string;
}

export interface HnSearchResponse {
  hits?: HnSearchHit[];
}

export interface HnComment {
  id: number;
  author: string;
  text?: string | null;
  children?: HnComment[];
}

export interface HnItemResponse {
  id: number;
  title: string;
  children?: HnComment[];
}

const HIRING_THREAD = /who is hiring/i;

export function parseHnHiringComment(
  value: unknown,
  threadId: string,
): { posting?: RawPosting; reason?: string; category?: "malformed" | "missing_fields" } {
  if (!isRecord(value)) {
    return { reason: "record is not an object", category: "malformed" };
  }
  const comment = value as unknown as HnComment;
  if (
    typeof comment.id !== "number" ||
    typeof comment.author !== "string" ||
    (comment.text != null && typeof comment.text !== "string")
  ) {
    return { reason: "missing or invalid comment fields", category: "missing_fields" };
  }
  const text = decodeHtmlEntities(comment.text ?? "");
  if (!text || text.length < 20) {
    return { reason: "comment too short", category: "malformed" };
  }

  const firstLine = text.split(/\n|<p>/)[0]?.replace(/^[-*]\s*/, "").trim() ?? "";
  let company = firstLine;
  let title = "Engineering role";

  const pipeParts = firstLine.split("|").map((part) => part.trim());
  if (pipeParts.length >= 2) {
    company = pipeParts[0];
    title = pipeParts[1] || title;
  } else {
    const dashMatch = firstLine.match(/^(.+?)\s[-–—]\s(.+)$/);
    if (dashMatch) {
      company = dashMatch[1].trim();
      title = dashMatch[2].trim();
    } else if (firstLine.length >= 8) {
      title = firstLine;
      company = comment.author;
    }
  }

  if (!company || company.length < 2) {
    company = comment.author;
  }

  if (!title || title.length < 2) {
    return { reason: "missing parsed title" };
  }

  return {
    posting: {
      sourceId: "hn-hiring",
      sourceJobId: `${threadId}-${comment.id}`,
      company,
      title,
      url: `https://news.ycombinator.com/item?id=${comment.id}`,
      listingUrl: `https://news.ycombinator.com/item?id=${threadId}`,
      location: /\bremote\b/i.test(text) ? "Remote" : "Verify geo",
      description: stripHtml(text),
      attribution: "Hacker News Who is Hiring",
    },
  };
}

export function parseHnHiringComments(
  value: unknown,
  threadId: string,
  threadCreatedAt?: string,
  attribution?: string,
): {
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics: QuarantineDiagnostics;
} {
  const collector = new QuarantineCollector();
  const postings: RawPosting[] = [];
  if (!Array.isArray(value)) {
    throw new Error("HN Who is Hiring comments must be an array");
  }
  const comments = value;

  for (let index = 0; index < comments.length; index += 1) {
    const comment = comments[index];
    const parsed = parseHnHiringComment(comment, threadId);
    if (!parsed.posting) {
      collector.record(
        parsed.reason ?? "invalid comment",
        parsed.category ?? "malformed",
        safeRecordSample(comment, ["id"], ["author"]),
        index,
      );
      continue;
    }

    postings.push({
      ...parsed.posting,
      postedAt: threadCreatedAt,
      attribution: attribution ?? parsed.posting.attribution,
    });
  }

  const quarantineDiagnostics = collector.toDiagnostics();
  return {
    postings,
    quarantined: quarantineDiagnostics.total,
    quarantineDiagnostics,
  };
}

export function findHiringThreadInSearch(response: unknown): HnSearchHit | null {
  const hits = requireArrayField(response, "hits", "HN search");
  for (const value of hits) {
    if (
      isRecord(value) &&
      typeof value.objectID === "string" &&
      typeof value.title === "string" &&
      HIRING_THREAD.test(value.title)
    ) {
      return value as unknown as HnSearchHit;
    }
  }
  return null;
}

export async function findLatestHiringThread(
  now: () => Date = () => new Date(),
): Promise<HnSearchHit | null> {
  const month = now().toLocaleString("en-US", { month: "long", year: "numeric" });
  const queries = [`Ask HN: Who is hiring? (${month})`, "Ask HN: Who is hiring?"];

  for (const query of queries) {
    const url =
      "https://hn.algolia.com/api/v1/search_by_date?" +
      `tags=ask_hn&query=${encodeURIComponent(query)}`;
    const response = await fetchJson<unknown>(url);
    const hit = findHiringThreadInSearch(response);
    if (hit) {
      return hit;
    }
  }

  return null;
}

export async function fetchHnHiringRaw(
  source: Pick<JobSourceEntry, "attribution">,
  deps: {
    findThread?: typeof findLatestHiringThread;
    fetchItem?: typeof fetchJson;
  } = {},
): Promise<{
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics: QuarantineDiagnostics;
  requestUrl: string;
}> {
  const findThread = deps.findThread ?? findLatestHiringThread;
  const fetchItem = deps.fetchItem ?? fetchJson;

  const thread = await findThread();
  if (!thread) {
    throw new Error("No recent HN Who is Hiring thread found");
  }

  const requestUrl = `https://hn.algolia.com/api/v1/items/${thread.objectID}`;
  const item = await fetchItem<unknown>(requestUrl);
  if (
    !isRecord(item) ||
    typeof item.id !== "number" ||
    typeof item.title !== "string"
  ) {
    throw new Error(
      "HN Who is Hiring item response must be an object with numeric id and string title",
    );
  }
  const comments = requireArrayField(item, "children", "HN Who is Hiring item");
  const parsed = parseHnHiringComments(
    comments,
    thread.objectID,
    thread.created_at,
    source.attribution,
  );

  return {
    ...parsed,
    requestUrl,
  };
}

export const hnHiringAdapter: JobBoardAdapter = {
  id: "hn-hiring",
  async fetch(source: JobSourceEntry, _context: BoardFetchContext): Promise<BoardFetchResult> {
    const { postings, quarantined, quarantineDiagnostics, requestUrl } =
      await fetchHnHiringRaw(source);
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

export function emptyHnHiringParseResult() {
  return {
    postings: [],
    quarantined: 0,
    quarantineDiagnostics: emptyQuarantineDiagnostics(),
  };
}
