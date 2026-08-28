import { describe, expect, it } from "vitest";
import {
  parseVoyagerJobDetailPayload,
  parseVoyagerSearchPayloads,
} from "../../src/lib/jobs/voyager.ts";

describe("voyager job detail parsing", () => {
  it("extracts location, description, and apply URL from nested payload", () => {
    const payload = {
      data: {
        applyMethod: {
          $type: "com.linkedin.voyager.jobs.OffsiteApply",
          companyApplyUrl: "https://jobs.example.com/apply/123",
        },
      },
      included: [
        {
          entityUrn: "urn:li:fsd_jobPosting:999",
          $type: "com.linkedin.voyager.jobs.JobPosting",
          formattedLocation: "Remote — Worldwide",
          description: {
            text: "<p>Work from anywhere. Open to global candidates.</p>",
          },
        },
      ],
    };

    const detail = parseVoyagerJobDetailPayload(payload);
    expect(detail.externalApplyUrl).toBe("https://jobs.example.com/apply/123");
    expect(detail.location).toBe("Remote — Worldwide");
    expect(detail.description).toContain("Work from anywhere");
    expect(detail.easyApplyOnly).toBe(false);
  });

  it("flags easy apply when no external URL is present", () => {
    const payload = {
      data: {
        applyMethod: {
          $type: "com.linkedin.voyager.jobs.ComplexOnsiteApply",
        },
        formattedLocation: "London, England, United Kingdom",
        description: "Must be eligible to work in the UK.",
      },
    };

    const detail = parseVoyagerJobDetailPayload(payload);
    expect(detail.easyApplyOnly).toBe(true);
    expect(detail.location).toBe("London, England, United Kingdom");
    expect(detail.description).toContain("eligible to work in the UK");
  });
});

describe("voyager search parsing", () => {
  it("captures location metadata on job posting entities", () => {
    const payloads = [
      {
        included: [
          {
            entityUrn: "urn:li:fsd_jobPosting:123",
            $type: "com.linkedin.voyager.jobs.JobPosting",
            title: "React Frontend Engineer",
            companyName: "Acme Corp",
            formattedLocation: "Remote",
          },
        ],
      },
    ];

    const hits = parseVoyagerSearchPayloads(payloads);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.location).toBe("Remote");
  });
});
