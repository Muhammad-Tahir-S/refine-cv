import { fetchJson } from "../fetch.js";
import { inferLevelFromFields, inferRemoteScopeFromFields } from "../filter.js";
import { makeDedupeKey } from "../dedupe.js";
import type { CompanyEntry, JobPosting } from "../types.js";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  categories: {
    location?: string;
    commitment?: string;
    team?: string;
  };
  descriptionPlain?: string;
  description?: string;
}

export async function fetchLeverJobs(company: CompanyEntry): Promise<JobPosting[]> {
  const url = `https://api.lever.co/v0/postings/${company.slug}?mode=json`;
  const data = await fetchJson<LeverPosting[]>(url);
  const fetchedAt = new Date().toISOString();

  return data.map((job) => {
    const description = job.descriptionPlain ?? job.description ?? "";
    const location = job.categories.location ?? "";
    return {
      company: company.name,
      title: job.text,
      url: job.hostedUrl,
      location,
      remoteScope: inferRemoteScopeFromFields(location, description),
      level: inferLevelFromFields(job.text, description),
      description,
      source: "lever" as const,
      fetchedAt,
      dedupeKey: makeDedupeKey(company.name, job.text),
    };
  });
}
