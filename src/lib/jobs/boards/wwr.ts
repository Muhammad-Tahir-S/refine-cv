import { fetchText } from "../fetch.js";
import { stripHtml } from "../normalize.js";
import type { JobSourceEntry, RawPosting } from "../types.js";
import {
  emptyQuarantineDiagnostics,
  isRecord,
  QuarantineCollector,
  safeRecordSample,
  type QuarantineDiagnostics,
} from "./quarantine.js";
import type { BoardFetchContext, BoardFetchResult, JobBoardAdapter } from "./types.js";

export const FEED_PATHS: Record<string, string> = {
  programming: "remote-programming-jobs",
  "front-end": "remote-front-end-programming-jobs",
  "back-end": "remote-back-end-programming-jobs",
  "full-stack": "remote-full-stack-programming-jobs",
  "product": "remote-product-jobs",
};

export interface WwrItem {
  title: string;
  link: string;
  region: string;
  description: string;
  pubDate?: string;
}

export function parseWwrTitle(rawTitle: string): { company: string; title: string } {
  const cleaned = rawTitle.trim();
  const colonIndex = cleaned.indexOf(":");
  if (colonIndex === -1) {
    return { company: "Unknown", title: cleaned };
  }
  return {
    company: cleaned.slice(0, colonIndex).trim(),
    title: cleaned.slice(colonIndex + 1).trim(),
  };
}

function readTag(block: string, tag: string): string {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(pattern);
  return match?.[1]?.trim() ?? "";
}

export function parseWwrRss(xml: unknown): WwrItem[] {
  if (
    typeof xml !== "string" ||
    !/<rss\b/i.test(xml) ||
    !/<channel\b/i.test(xml)
  ) {
    throw new Error("WWR response must be an RSS document with a channel");
  }
  const items: WwrItem[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const block of itemBlocks) {
    const title = readTag(block, "title");
    const link = readTag(block, "link");
    items.push({
      title,
      link,
      region: readTag(block, "region") || "Remote",
      description: readTag(block, "description"),
      pubDate: readTag(block, "pubDate") || undefined,
    });
  }

  return items;
}

export function buildWwrFeedUrl(feed: string): string {
  const path = FEED_PATHS[feed] ?? feed;
  return `https://weworkremotely.com/categories/${encodeURIComponent(path)}.rss`;
}

export function parseWwrItems(
  value: unknown,
  attribution?: string,
): {
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics: QuarantineDiagnostics;
} {
  const collector = new QuarantineCollector();
  const postings: RawPosting[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(value)) {
    throw new Error("WWR parsed feed items must be an array");
  }
  const items = value;

  for (let index = 0; index < items.length; index += 1) {
    const value = items[index];
    if (!isRecord(value)) {
      collector.record("record is not an object", "malformed", undefined, index);
      continue;
    }
    const item = value as unknown as WwrItem;
    if (
      typeof item.link !== "string" ||
      typeof item.title !== "string" ||
      !item.link ||
      !item.title
    ) {
      collector.record(
        "missing or invalid title or link",
        "missing_fields",
        safeRecordSample(value, ["link"], ["title"]),
        index,
      );
      continue;
    }
    if (seen.has(item.link)) {
      continue;
    }
    seen.add(item.link);

    const { company, title } = parseWwrTitle(item.title);
    if (!title) {
      collector.record("missing parsed title", "malformed", { identifier: item.link }, index);
      continue;
    }

    postings.push({
      sourceId: "wwr",
      sourceJobId: item.link,
      company,
      title,
      url: item.link,
      listingUrl: item.link,
      location: typeof item.region === "string" ? item.region : "Remote",
      description:
        typeof item.description === "string" ? stripHtml(item.description) : "",
      postedAt: typeof item.pubDate === "string" ? item.pubDate : undefined,
      attribution,
    });
  }

  const quarantineDiagnostics = collector.toDiagnostics();
  return {
    postings,
    quarantined: quarantineDiagnostics.total,
    quarantineDiagnostics,
  };
}

export async function fetchWwrRaw(
  source: Pick<JobSourceEntry, "feeds" | "attribution">,
): Promise<{
  postings: RawPosting[];
  quarantined: number;
  quarantineDiagnostics: QuarantineDiagnostics;
  requestUrls: string[];
}> {
  const feeds = (source.feeds ?? ["programming"]).slice(0, 8);
  const postings: RawPosting[] = [];
  const collector = new QuarantineCollector();
  const seen = new Set<string>();
  const requestUrls: string[] = [];

  for (const feed of feeds) {
    const requestUrl = buildWwrFeedUrl(feed);
    requestUrls.push(requestUrl);
    const xml: unknown = await fetchText(requestUrl);
    const items = parseWwrRss(xml);

    for (let index = 0; index < items.length; index += 1) {
      const value: unknown = items[index];
      if (!isRecord(value)) {
        collector.record("record is not an object", "malformed", undefined, index);
        continue;
      }
      const item = value as unknown as WwrItem;
      if (
        typeof item.link !== "string" ||
        typeof item.title !== "string" ||
        !item.link ||
        !item.title
      ) {
        collector.record(
          "missing or invalid title or link",
          "missing_fields",
          safeRecordSample(value, ["link"], ["title"]),
          index,
        );
        continue;
      }
      if (seen.has(item.link)) {
        continue;
      }
      seen.add(item.link);

      const { company, title } = parseWwrTitle(item.title);
      if (!title) {
        collector.record("missing parsed title", "malformed", { identifier: item.link }, index);
        continue;
      }

      postings.push({
        sourceId: "wwr",
        sourceJobId: item.link,
        company,
        title,
        url: item.link,
        listingUrl: item.link,
        location: typeof item.region === "string" ? item.region : "Remote",
        description:
          typeof item.description === "string" ? stripHtml(item.description) : "",
        postedAt: typeof item.pubDate === "string" ? item.pubDate : undefined,
        attribution: source.attribution,
      });
    }
  }

  const quarantineDiagnostics = collector.toDiagnostics();
  return {
    postings,
    quarantined: quarantineDiagnostics.total,
    quarantineDiagnostics,
    requestUrls,
  };
}

export const wwrAdapter: JobBoardAdapter = {
  id: "wwr",
  async fetch(source: JobSourceEntry, _context: BoardFetchContext): Promise<BoardFetchResult> {
    const { postings, quarantined, quarantineDiagnostics, requestUrls } =
      await fetchWwrRaw(source);
    return {
      sourceId: source.id,
      adapter: source.adapter,
      postings,
      quarantined,
      quarantineDiagnostics,
      requestUrl: requestUrls.join(", "),
      attribution: source.attribution,
    };
  },
};

export function emptyWwrParseResult() {
  return {
    postings: [],
    quarantined: 0,
    quarantineDiagnostics: emptyQuarantineDiagnostics(),
  };
}
