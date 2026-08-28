import { describe, expect, it } from "vitest";
import {
  buildLinkedInSearchUrl,
  filterByLinkedInRoleProfile,
  LINKEDIN_DEFAULT_EXPERIENCE_LEVELS,
  LINKEDIN_MAX_PAGES,
  matchesLinkedInRoleProfile,
  parseExperienceLevels,
  parseRoleProfile,
  resolveMaxPages,
} from "../../src/lib/jobs/linkedin-options.ts";

describe("linkedin search url", () => {
  it("uses default keywords and experience levels without EMEA geoId", () => {
    const url = buildLinkedInSearchUrl({ page: 1 });
    expect(url).toContain("keywords=react+frontend");
    expect(url).toContain(
      `f_E=${encodeURIComponent(LINKEDIN_DEFAULT_EXPERIENCE_LEVELS)}`,
    );
    expect(url).toContain("start=0");
    expect(url).toContain("f_WT=2");
    expect(url).toContain("sortBy=DD");
    expect(url).not.toContain("geoId=");
  });

  it("applies custom keywords and experience filters", () => {
    const url = buildLinkedInSearchUrl({
      page: 2,
      keywords: "node backend",
      experienceLevels: "2,3",
    });
    expect(url).toContain("keywords=node+backend");
    expect(url).toContain("f_E=2%2C3");
    expect(url).toContain("start=25");
  });
});

describe("linkedin option parsing", () => {
  it("accepts valid page counts up to the hard limit", () => {
    expect(resolveMaxPages("1")).toBe(1);
    expect(resolveMaxPages(String(LINKEDIN_MAX_PAGES))).toBe(LINKEDIN_MAX_PAGES);
  });

  it("rejects invalid or over-limit page counts", () => {
    expect(() => resolveMaxPages("0")).toThrow(/Invalid --pages/);
    expect(() => resolveMaxPages("abc")).toThrow(/Invalid --pages/);
    expect(() => resolveMaxPages("1.5")).toThrow(/Invalid --pages/);
    expect(() => resolveMaxPages("2abc")).toThrow(/Invalid --pages/);
    expect(() => resolveMaxPages(String(LINKEDIN_MAX_PAGES + 1))).toThrow(
      /cannot exceed/,
    );
  });

  it("rejects invalid numeric values at the library boundary", () => {
    expect(() => resolveMaxPages(1.5)).toThrow(/Invalid --pages/);
    expect(() => resolveMaxPages(LINKEDIN_MAX_PAGES + 1)).toThrow(
      /cannot exceed/,
    );
  });

  it("normalizes experience levels", () => {
    expect(parseExperienceLevels("2, 3, 4")).toBe("2,3,4");
  });

  it("rejects invalid experience levels", () => {
    expect(() => parseExperienceLevels("")).toThrow(/Invalid --experience/);
    expect(() => parseExperienceLevels("2,x,4")).toThrow(/Invalid experience level/);
    expect(() => parseExperienceLevels("0,2")).toThrow(/Invalid experience level/);
  });

  it("accepts supported role profiles only", () => {
    expect(parseRoleProfile("reactFrontend")).toBe("reactFrontend");
    expect(parseRoleProfile("nodejsBackend")).toBe("nodejsBackend");
    expect(() => parseRoleProfile("fullstack")).toThrow(/Invalid role profile/);
  });
});

describe("linkedin role filter", () => {
  it("matches conservative react frontend titles", () => {
    expect(matchesLinkedInRoleProfile("Senior React Engineer", "reactFrontend")).toBe(
      true,
    );
    expect(
      matchesLinkedInRoleProfile("Frontend Developer (Remote)", "reactFrontend"),
    ).toBe(true);
    expect(matchesLinkedInRoleProfile("Backend Engineer", "reactFrontend")).toBe(
      false,
    );
  });

  it("matches conservative nodejs backend titles", () => {
    expect(
      matchesLinkedInRoleProfile("Senior Node.js Backend Engineer", "nodejsBackend"),
    ).toBe(true);
    expect(matchesLinkedInRoleProfile("NestJS API Engineer", "nodejsBackend")).toBe(
      true,
    );
    expect(
      matchesLinkedInRoleProfile("Frontend Engineer (React)", "nodejsBackend"),
    ).toBe(false);
  });

  it("reports accurate after-role-filter counts", () => {
    const hits = [
      { title: "React Frontend Engineer", jobId: "1" },
      { title: "Backend Engineer", jobId: "2" },
      { title: "Node.js Backend Developer", jobId: "3" },
    ];

    expect(filterByLinkedInRoleProfile(hits, "reactFrontend")).toHaveLength(1);
    expect(filterByLinkedInRoleProfile(hits, "nodejsBackend")).toHaveLength(2);
  });
});
