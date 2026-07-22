import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadJobSourcesConfig } from "../src/lib/jobs/sources/registry.ts";
import { loadJobSearchConfigAt } from "../src/lib/jobs/scan-policy.ts";
import { paths } from "../src/lib/paths.ts";
import { fixturePaths } from "./jobs/helpers/fixture-paths.ts";

describe("validate-setup job scan prerequisites", () => {
  it("loads config/job-sources.json", () => {
    expect(() => loadJobSourcesConfig()).not.toThrow();
  });

  it("loads tracked job-search example templates", () => {
    expect(() =>
      loadJobSearchConfigAt(join(paths.root, "config", "job-search.example.json")),
    ).not.toThrow();
    expect(() =>
      loadJobSearchConfigAt(
        join(paths.root, "config", "job-search-nodejs-backend.example.json"),
      ),
    ).not.toThrow();
  });

  it("loads test fixtures used by the scan suite", () => {
    expect(() => loadJobSearchConfigAt(fixturePaths.jobSearchReact)).not.toThrow();
    expect(() => loadJobSearchConfigAt(fixturePaths.jobSearchNodejsBackend)).not.toThrow();
  });

  it("loads local job-search.json when present (gitignored)", () => {
    if (!existsSync(paths.jobSearchConfig)) {
      return;
    }
    expect(() => loadJobSearchConfigAt(paths.jobSearchConfig)).not.toThrow();
  });

  it("includes the scan-jobs skill", () => {
    expect(existsSync(paths.scanJobsSkill)).toBe(true);
  });
});
