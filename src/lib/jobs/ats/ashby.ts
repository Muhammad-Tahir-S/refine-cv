import { fetchJson } from "../fetch.js";
import { inferLevelFromFields, inferRemoteScopeFromFields } from "../filter.js";
import { makeDedupeKey } from "../dedupe.js";
import type { CompanyEntry, JobPosting } from "../types.js";

interface AshbyJob {
  id: string;
  title: string;
  jobUrl: string;
  location: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  isRemote?: boolean;
}

interface AshbyResponse {
  jobs: AshbyJob[];
}

export async function fetchAshbyJobs(company: CompanyEntry): Promise<JobPosting[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${company.slug}`;
  const data = await fetchJson<AshbyResponse>(url);
  const fetchedAt = new Date().toISOString();

  return data.jobs.map((job) => {
    const description = job.descriptionPlain ?? job.descriptionHtml ?? "";
    const location = job.location ?? "";
    const remoteHint = job.isRemote ? "remote" : "";
    return {
      company: company.name,
      title: job.title,
      url: job.jobUrl,
      location,
      remoteScope: inferRemoteScopeFromFields(`${location} ${remoteHint}`, description),
      level: inferLevelFromFields(job.title, description),
      description,
      source: "ashby" as const,
      fetchedAt,
      dedupeKey: makeDedupeKey(company.name, job.title),
    };
  });
}
