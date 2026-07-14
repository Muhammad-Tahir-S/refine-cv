import { fetchText } from "../fetch.js";
import { inferLevelFromFields, inferRemoteScopeFromFields } from "../filter.js";
import { makeDedupeKey } from "../dedupe.js";
import type { CompanyEntry, JobPosting } from "../types.js";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitleFromUrl(url: string): string {
  const slug = url.split("/").filter(Boolean).pop() ?? "Open role";
  return slug.replace(/[-_]/g, " ");
}

function isSpecificJobUrl(url: string): boolean {
  const path = new URL(url).pathname;
  const segments = path.split("/").filter(Boolean);
  return segments.length >= 2 && segments[segments.length - 1] !== "careers";
}

export async function fetchCustomJobs(company: CompanyEntry): Promise<JobPosting[]> {
  if (!company.careersUrl) {
    throw new Error(`Custom company ${company.name} requires careersUrl`);
  }

  const html = await fetchText(company.careersUrl);
  const text = stripHtml(html);
  const fetchedAt = new Date().toISOString();

  if (isSpecificJobUrl(company.careersUrl)) {
    const title = extractTitleFromUrl(company.careersUrl);
    return [
      {
        company: company.name,
        title,
        url: company.careersUrl,
        location: "",
        remoteScope: inferRemoteScopeFromFields("", text),
        level: inferLevelFromFields(title, text),
        description: text.slice(0, 4000),
        source: "custom",
        fetchedAt,
        dedupeKey: makeDedupeKey(company.name, title),
      },
    ];
  }

  const postings: JobPosting[] = [];
  const linkPattern = /href=["']([^"']*(?:career|job|journey|opening|position)[^"']*)["']/gi;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    let href = match[1];
    if (href.startsWith("/")) {
      const base = new URL(company.careersUrl);
      href = `${base.origin}${href}`;
    } else if (!href.startsWith("http")) {
      continue;
    }

    if (seen.has(href) || href.endsWith("/careers") || href.endsWith("/careers/")) {
      continue;
    }
    seen.add(href);

    const title = extractTitleFromUrl(href);
    postings.push({
      company: company.name,
      title,
      url: href,
      location: "",
      remoteScope: inferRemoteScopeFromFields("", text),
      level: inferLevelFromFields(title, text),
      description: text.slice(0, 4000),
      source: "custom",
      fetchedAt,
      dedupeKey: makeDedupeKey(company.name, title),
    });
  }

  return postings;
}
