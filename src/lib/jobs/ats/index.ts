import { fetchAshbyJobs } from "./ashby.js";
import { fetchCustomJobs } from "./custom.js";
import { fetchGreenhouseJobs } from "./greenhouse.js";
import { fetchLeverJobs } from "./lever.js";
import { fetchWorkableJobs } from "./workable.js";
import type { CompanyEntry, JobPosting } from "../types.js";

export async function fetchCompanyJobs(company: CompanyEntry): Promise<JobPosting[]> {
  switch (company.ats) {
    case "greenhouse":
      return fetchGreenhouseJobs(company);
    case "lever":
      return fetchLeverJobs(company);
    case "ashby":
      return fetchAshbyJobs(company);
    case "workable":
      return fetchWorkableJobs(company);
    case "custom":
      return fetchCustomJobs(company);
    default:
      throw new Error(`Unsupported ATS type for ${company.name}`);
  }
}

export async function probeAtsSlug(
  slug: string,
): Promise<{ ats: CompanyEntry["ats"]; ok: boolean } | null> {
  const probes: Array<{ ats: CompanyEntry["ats"]; fn: () => Promise<unknown> }> = [
    {
      ats: "greenhouse",
      fn: () =>
        fetch(
          `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
        ).then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found")))),
    },
    {
      ats: "lever",
      fn: () =>
        fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`).then((r) =>
          r.ok ? r.json() : Promise.reject(new Error("not found")),
        ),
    },
    {
      ats: "ashby",
      fn: () =>
        fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`).then((r) =>
          r.ok ? r.json() : Promise.reject(new Error("not found")),
        ),
    },
  ];

  for (const probe of probes) {
    try {
      await probe.fn();
      return { ats: probe.ats, ok: true };
    } catch {
      // try next
    }
  }
  return null;
}
