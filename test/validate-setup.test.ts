import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadJobSourcesConfig } from "../src/lib/jobs/sources/registry.ts";
import { loadJobSearchConfigAt } from "../src/lib/jobs/scan-policy.ts";
import { paths } from "../src/lib/paths.ts";

describe("validate-setup job scan prerequisites", () => {
  it("loads config/job-sources.json", () => {
    expect(() => loadJobSourcesConfig()).not.toThrow();
  });

  it("loads config/job-search.json", () => {
    expect(() => loadJobSearchConfigAt(paths.jobSearchConfig)).not.toThrow();
  });

  it("loads config/job-search-nodejs-backend.json when present", () => {
    if (!existsSync(paths.jobSearchNodejsBackendConfig)) {
      return;
    }
    expect(() => loadJobSearchConfigAt(paths.jobSearchNodejsBackendConfig)).not.toThrow();
  });

  it("includes the scan-jobs skill", () => {
    expect(existsSync(paths.scanJobsSkill)).toBe(true);
  });
});
