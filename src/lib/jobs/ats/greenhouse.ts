import { fetchJson } from "../fetch.js";
import { inferLevelFromFields, inferRemoteScopeFromFields } from "../filter.js";
import { makeDedupeKey } from "../dedupe.js";
import type { CompanyEntry, JobPosting } from "../types.js";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  content?: string;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

export async function fetchGreenhouseJobs(company: CompanyEntry): Promise<JobPosting[]> {
  const host = company.greenhouseHost ?? "boards-api.greenhouse.io";
  const url = `https://${host}/v1/boards/${company.slug}/jobs?content=true`;
  const data = await fetchJson<GreenhouseResponse>(url);
  const fetchedAt = new Date().toISOString();

  return data.jobs.map((job) => {
    const description = job.content ?? "";
    const location = job.location?.name ?? "";
    return {
      company: company.name,
      title: job.title,
      url: job.absolute_url,
      location,
      remoteScope: inferRemoteScopeFromFields(location, description),
      level: inferLevelFromFields(job.title, description),
      description,
      source: "greenhouse" as const,
      fetchedAt,
      dedupeKey: makeDedupeKey(company.name, job.title),
    };
  });
}
