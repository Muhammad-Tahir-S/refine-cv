import { describe, expect, it } from "vitest";
import { scanTrackedPath } from "../scripts/check-release-safety.ts";

describe("scanTrackedPath", () => {
  it("allows tracked onboarding template", () => {
    expect(scanTrackedPath("profile/ONBOARDING.md")).toEqual([]);
  });

  it("flags tracked personal profile files", () => {
    expect(scanTrackedPath("profile/base-cv.pdf")).toEqual([
      "profile/base-cv.pdf: tracked personal profile file",
    ]);
  });

  it("flags tracked job artifacts", () => {
    expect(scanTrackedPath("jobs/2026-07-21-example/pitch.md")).toEqual([
      "jobs/2026-07-21-example/pitch.md: tracked job application artifact",
    ]);
  });

  it("allows jobs/.gitkeep", () => {
    expect(scanTrackedPath("jobs/.gitkeep")).toEqual([]);
  });

  it("flags tracked personal config", () => {
    expect(scanTrackedPath("config/github-repos.json")).toEqual([
      "config/github-repos.json: tracked personal GitHub config",
    ]);
    expect(scanTrackedPath("config/job-search.json")).toEqual([
      "config/job-search.json: tracked personal job search config",
    ]);
    expect(scanTrackedPath("config/job-search-nodejs-backend.json")).toEqual([
      "config/job-search-nodejs-backend.json: tracked personal job search config",
    ]);
  });

  it("allows tracked example configs", () => {
    expect(scanTrackedPath("config/github-repos.example.json")).toEqual([]);
    expect(scanTrackedPath("config/job-search.example.json")).toEqual([]);
    expect(scanTrackedPath("config/job-search-nodejs-backend.example.json")).toEqual(
      [],
    );
    expect(scanTrackedPath(".env.example")).toEqual([]);
  });

  it("flags tracked env files except .env.example", () => {
    expect(scanTrackedPath(".env")).toEqual([".env: tracked secrets or env file"]);
    expect(scanTrackedPath(".env.local")).toEqual([".env.local: tracked secrets or env file"]);
  });
});
