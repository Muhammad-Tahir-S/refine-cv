import { fetchJson } from "../fetch.js";
import { inferLevelFromFields, inferRemoteScopeFromFields } from "../filter.js";
import { makeDedupeKey } from "../dedupe.js";
import type { CompanyEntry, JobPosting } from "../types.js";

interface WorkableJob {
  title: string;
  shortcode: string;
  url: string;
  location: {
    city?: string;
    country?: string;
    telecommuting?: boolean;
  };
  description?: string;
}

interface WorkableResponse {
  jobs: WorkableJob[];
}

export async function fetchWorkableJobs(company: CompanyEntry): Promise<JobPosting[]> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${company.slug}`;
  const data = await fetchJson<WorkableResponse>(url);
  const fetchedAt = new Date().toISOString();

  return data.jobs.map((job) => {
    const locationParts = [job.location.city, job.location.country].filter(Boolean);
    const location = locationParts.join(", ");
    const remoteHint = job.location.telecommuting ? "remote telecommuting" : "";
    const description = job.description ?? "";
    return {
      company: company.name,
      title: job.title,
      url: job.url,
      location,
      remoteScope: inferRemoteScopeFromFields(`${location} ${remoteHint}`, description),
      level: inferLevelFromFields(job.title, description),
      description,
      source: "workable" as const,
      fetchedAt,
      dedupeKey: makeDedupeKey(company.name, job.title),
    };
  });
}
