import { fetchJson } from "../fetch.js";
import { decodeHtmlEntities, stripHtml } from "../normalize.js";
import type { JobSourceEntry, RawPosting } from "../types.js";
import type { BoardFetchResult, JobBoardAdapter } from "./types.js";

interface HnSearchHit {
  objectID: string;
  title: string;
  created_at?: string;
}

interface HnSearchResponse {
  hits: HnSearchHit[];
}

interface HnComment {
  id: number;
  author: string;
  text?: string;
  children?: HnComment[];
}

interface HnItemResponse {
  id: number;
  title: string;
  children?: HnComment[];
}

const FRONTEND_SIGNAL =
  /\b(react|frontend|front-end|front end|next\.?js|typescript|javascript|web engineer|ui engineer)\b/i;

const HIRING_THREAD = /who is hiring/i;

export function parseHnHiringComment(comment: HnComment, threadId: string): RawPosting | null {
  const text = decodeHtmlEntities(comment.text ?? "");
  if (!text || text.length < 40) {
    return null;
  }
  if (!FRONTEND_SIGNAL.test(text)) {
    return null;
  }

  const firstLine = text.split(/\n|<p>/)[0]?.replace(/^[-*]\s*/, "").trim() ?? "";
  let company = firstLine;
  let title = "Engineering role";

  const pipeParts = firstLine.split("|").map((part) => part.trim());
  if (pipeParts.length >= 2) {
    company = pipeParts[0];
    title = pipeParts[1];
  } else {
    const dashMatch = firstLine.match(/^(.+?)\s[-–—]\s(.+)$/);
    if (dashMatch) {
      company = dashMatch[1].trim();
      title = dashMatch[2].trim();
    } else if (FRONTEND_SIGNAL.test(firstLine)) {
      title = firstLine;
      company = comment.author;
    }
  }

  if (!company || company.length < 2) {
    company = comment.author;
  }

  return {
    sourceId: "hn-hiring",
    sourceJobId: `${threadId}-${comment.id}`,
    company,
    title,
    url: `https://news.ycombinator.com/item?id=${comment.id}`,
    listingUrl: `https://news.ycombinator.com/item?id=${threadId}`,
    location: /\bremote\b/i.test(text) ? "Remote" : "Verify geo",
    description: stripHtml(text),
    attribution: "Hacker News Who is Hiring",
  };
}

export function flattenHnComments(comments: HnComment[] | undefined, out: HnComment[] = []): HnComment[] {
  for (const comment of comments ?? []) {
    out.push(comment);
    flattenHnComments(comment.children, out);
  }
  return out;
}

async function findLatestHiringThread(): Promise<HnSearchHit | null> {
  const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
  const queries = [`Ask HN: Who is hiring? (${month})`, "Ask HN: Who is hiring?"];

  for (const query of queries) {
    const url =
      "https://hn.algolia.com/api/v1/search_by_date?" +
      `tags=ask_hn&query=${encodeURIComponent(query)}`;
    const response = await fetchJson<HnSearchResponse>(url);
    const hit = response.hits?.find((entry) => HIRING_THREAD.test(entry.title));
    if (hit) {
      return hit;
    }
  }

  return null;
}

export const hnHiringAdapter: JobBoardAdapter = {
  id: "hn-hiring",
  async fetch(source: JobSourceEntry): Promise<BoardFetchResult> {
    const thread = await findLatestHiringThread();
    if (!thread) {
      throw new Error("No recent HN Who is Hiring thread found");
    }

    const item = await fetchJson<HnItemResponse>(
      `https://hn.algolia.com/api/v1/items/${thread.objectID}`,
    );
    const comments = flattenHnComments(item.children);
    const postings: RawPosting[] = [];

    for (const comment of comments) {
      const posting = parseHnHiringComment(comment, thread.objectID);
      if (posting) {
        postings.push({
          ...posting,
          postedAt: thread.created_at,
          attribution: source.attribution,
        });
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
