import { fetchText } from "../fetch.js";
import { stripHtml } from "../normalize.js";
import type { JobSourceEntry, RawPosting } from "../types.js";
import type { BoardFetchResult, JobBoardAdapter } from "./types.js";

const FEED_PATHS: Record<string, string> = {
  programming: "remote-programming-jobs",
  "front-end": "remote-front-end-programming-jobs",
  "full-stack": "remote-full-stack-programming-jobs",
};

interface WwrItem {
  title: string;
  link: string;
  region: string;
  description: string;
  pubDate?: string;
}

function parseWwrTitle(rawTitle: string): { company: string; title: string } {
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

export function parseWwrRss(xml: string): WwrItem[] {
  const items: WwrItem[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  for (const block of itemBlocks) {
    const title = readTag(block, "title");
    const link = readTag(block, "link");
    if (!title || !link) {
      continue;
    }
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

export const wwrAdapter: JobBoardAdapter = {
  id: "wwr",
  async fetch(source: JobSourceEntry): Promise<BoardFetchResult> {
    const feeds = source.feeds ?? ["programming", "front-end", "full-stack"];
    const postings: RawPosting[] = [];
    const seen = new Set<string>();

    for (const feed of feeds) {
      const path = FEED_PATHS[feed] ?? feed;
      const url = `https://weworkremotely.com/categories/${path}.rss`;
      const xml = await fetchText(url);
      const items = parseWwrRss(xml);

      for (const item of items) {
        if (seen.has(item.link)) {
          continue;
        }
        seen.add(item.link);

        const { company, title } = parseWwrTitle(item.title);
        postings.push({
          sourceId: "wwr",
          sourceJobId: item.link,
          company,
          title,
          url: item.link,
          listingUrl: item.link,
          location: item.region,
          description: stripHtml(item.description),
          postedAt: item.pubDate,
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
