import type { RoleProfile } from "./geo.js";

export const LINKEDIN_MAX_PAGES = 3;
export const LINKEDIN_DEFAULT_KEYWORDS = "react frontend";
export const LINKEDIN_DEFAULT_EXPERIENCE_LEVELS = "2,3,4";

export interface LinkedInSearchUrlOptions {
  page?: number;
  keywords?: string;
  experienceLevels?: string;
}

const REACT_FRONTEND_TITLE_PATTERNS = [
  /\bfrontend\b/i,
  /\bfront-end\b/i,
  /\bfront end\b/i,
  /\breact\b/i,
  /\bnext\.?js\b/i,
  /\bweb engineer\b/i,
  /\bweb developer\b/i,
  /\bui engineer\b/i,
  /\bjavascript engineer\b/i,
  /\btypescript engineer\b/i,
  /\bfull[- ]stack\b/i,
  /\bfullstack\b/i,
];

const REACT_FRONTEND_TITLE_EXCLUDE = [
  /\bengineering manager\b/i,
  /\bdirector\b/i,
  /\bcustomer success\b/i,
  /\bsales\b/i,
  /\bsupport engineer\b/i,
  /\bbackend engineer\b/i,
  /\bplatform engineer\b/i,
  /\bdevops\b/i,
  /\bsre\b/i,
  /\bgolang\b/i,
  /\bpython engineer\b/i,
  /\brust engineer\b/i,
];

const NODEJS_BACKEND_TITLE_PATTERNS = [
  /\bnode\.?js\b/i,
  /\bbackend engineer\b/i,
  /\bback-end engineer\b/i,
  /\bserver[- ]side\b/i,
  /\bnestjs\b/i,
  /\bexpress\b/i,
  /\bapi engineer\b/i,
  /\bplatform engineer\b/i,
];

const NODEJS_BACKEND_TITLE_EXCLUDE = [
  /\bfrontend engineer\b/i,
  /\bfront-end engineer\b/i,
  /\breact engineer\b/i,
  /\bui engineer\b/i,
  /\bux engineer\b/i,
];

export function parseExperienceLevels(input: string): string {
  const levels = input
    .split(",")
    .map((level) => level.trim())
    .filter(Boolean);

  if (levels.length === 0) {
    throw new Error(
      "Invalid --experience value. Provide comma-separated LinkedIn f_E codes (1-6), e.g. 2,3,4.",
    );
  }

  for (const level of levels) {
    if (!/^[1-6]$/.test(level)) {
      throw new Error(
        `Invalid experience level "${level}". Use LinkedIn f_E codes 1-6 (e.g. 2,3,4).`,
      );
    }
  }

  return levels.join(",");
}

export function resolveMaxPages(input: string | number): number {
  const parsed =
    typeof input === "number"
      ? input
      : /^\d+$/.test(input)
        ? Number(input)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `Invalid --pages value "${input}". Use an integer from 1 to ${LINKEDIN_MAX_PAGES}.`,
    );
  }

  if (parsed > LINKEDIN_MAX_PAGES) {
    throw new Error(
      `--pages cannot exceed ${LINKEDIN_MAX_PAGES} (hard limit).`,
    );
  }

  return parsed;
}

export function parseRoleProfile(input: string): RoleProfile {
  if (input === "reactFrontend" || input === "nodejsBackend") {
    return input;
  }

  throw new Error(
    `Invalid --role "${input}". Use reactFrontend or nodejsBackend.`,
  );
}

export function buildLinkedInSearchUrl(
  options: LinkedInSearchUrlOptions = {},
): string {
  const page = options.page ?? 1;
  const keywords = options.keywords ?? LINKEDIN_DEFAULT_KEYWORDS;
  const experienceLevels = parseExperienceLevels(
    options.experienceLevels ?? LINKEDIN_DEFAULT_EXPERIENCE_LEVELS,
  );

  const params = new URLSearchParams({
    keywords,
    geoId: "91000007",
    f_TPR: "r604800",
    f_E: experienceLevels,
    f_WT: "2",
    start: String((page - 1) * 25),
  });

  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

export function matchesLinkedInRoleProfile(
  title: string,
  profile: RoleProfile,
): boolean {
  if (profile === "nodejsBackend") {
    return matchesNodejsBackendTitle(title);
  }
  return matchesReactFrontendTitle(title);
}

function matchesReactFrontendTitle(title: string): boolean {
  if (REACT_FRONTEND_TITLE_EXCLUDE.some((pattern) => pattern.test(title))) {
    const rescue = /\b(frontend|react|web ui)\b/i.test(title);
    if (!rescue) {
      return false;
    }
  }

  return REACT_FRONTEND_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

function matchesNodejsBackendTitle(title: string): boolean {
  if (NODEJS_BACKEND_TITLE_EXCLUDE.some((pattern) => pattern.test(title))) {
    const rescue =
      /\b(full[- ]stack|fullstack|node\.?js|backend)\b/i.test(title);
    if (!rescue) {
      return false;
    }
  }

  return NODEJS_BACKEND_TITLE_PATTERNS.some((pattern) =>
    pattern.test(title),
  );
}

export function filterByLinkedInRoleProfile<T extends { title: string }>(
  hits: T[],
  profile: RoleProfile,
): T[] {
  return hits.filter((hit) => matchesLinkedInRoleProfile(hit.title, profile));
}
