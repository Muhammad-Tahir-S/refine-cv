import {
  classifyGeoEligibility,
  geoExclusionReason,
  isRestrictedRemoteScope,
} from "./geo.js";
import type { GeoEligibility, JobPosting, LevelHint, RemoteScope } from "./types.js";

const TITLE_FRONTEND_PATTERNS = [
  /\bfrontend\b/i,
  /\bfront-end\b/i,
  /\bfront end\b/i,
  /\breact\b/i,
  /\bnext\.?js\b/i,
  /\bweb engineer\b/i,
  /\bweb developer\b/i,
  /\bui engineer\b/i,
  /\bproduct engineer\b/i,
  /\bdesign engineer\b/i,
  /\bjavascript engineer\b/i,
  /\btypescript engineer\b/i,
  /\bgrowth engineer\b/i,
  /\bfull[- ]stack\b/i,
  /\bfullstack\b/i,
];

const TITLE_EXCLUDE_PATTERNS = [
  /\bengineering manager\b/i,
  /\bmanager\b/i,
  /\bdirector\b/i,
  /\bcustomer success\b/i,
  /\bsales\b/i,
  /\bsdr\b/i,
  /\bsupport engineer\b/i,
  /\bsustaining\b/i,
  /\boperations engineer\b/i,
  /\bdelivery lead\b/i,
  /\brecruiter\b/i,
  /\baccount executive\b/i,
  /\btechnical author\b/i,
  /\bgolang\b/i,
  /\bpython engineer\b/i,
  /\brust engineer\b/i,
  /\bopenstack\b/i,
  /\bcloud engineering\b/i,
  /\bbackend engineer\b/i,
  /\bplatform engineer\b/i,
  /\bdevops\b/i,
  /\bsre\b/i,
  /\bobservability\b/i,
];

const DESCRIPTION_REACT_PATTERNS = [/\breact\b/i, /\bnext\.?js\b/i, /\breact\.js\b/i];

const EXCLUDE_STACK = ["angular", "vue 3", "vue.js"];

const GLOBAL_REMOTE_PATTERNS = [
  /\bworldwide\b/i,
  /\bglobal remote\b/i,
  /\bwork from anywhere\b/i,
  /\banywhere in the world\b/i,
  /\bremote anywhere\b/i,
  /\bhome based\b.*\bworldwide\b/i,
  /\bglobally remote\b/i,
  /\bopen to applicants located anywhere\b/i,
];

const EMEA_PATTERNS = [
  /\bemea\b/i,
  /\beurope\b/i,
  /\beu\b/i,
  /\buk\b/i,
  /\bunited kingdom\b/i,
  /\bremote-first\b/i,
  /\bhome based\b/i,
];

const RESTRICTED_PATTERNS = [
  /\bus only\b/i,
  /\bunited states only\b/i,
  /\bhybrid\b/i,
  /\bon-?site\b/i,
  /\bnyc\b/i,
  /\bsan francisco\b/i,
  /\bpoland only\b/i,
];

export function classifyRemoteScope(location: string, description: string): RemoteScope {
  const loc = location.toLowerCase().trim();

  if (loc) {
    if (/\bhome based - worldwide\b/i.test(loc) || /\bworldwide\b/i.test(loc)) {
      return "global";
    }
    if (/\bhome based - emea\b/i.test(loc) || (/\bemea\b/i.test(loc) && !/\bworldwide\b/i.test(loc))) {
      return "emea";
    }
    if (GLOBAL_REMOTE_PATTERNS.some((pattern) => pattern.test(loc))) {
      return "global";
    }
    if (RESTRICTED_PATTERNS.some((pattern) => pattern.test(loc))) {
      return "regional";
    }
  }

  const haystack = `${location}\n${description}`.toLowerCase();
  if (GLOBAL_REMOTE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return "global";
  }
  if (EMEA_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return "emea";
  }
  if (RESTRICTED_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return "regional";
  }
  if (/\bremote\b/i.test(haystack)) {
    return "unknown";
  }
  return "regional";
}

export function classifyLevel(title: string, description: string): LevelHint {
  const text = `${title} ${description}`.toLowerCase();
  if (/\b(staff|lead|principal|director|head of)\b/.test(text)) {
    return "staff_lead";
  }
  if (/\b(senior|sr\.)\b/.test(text)) {
    return "senior";
  }
  if (/\b(junior|entry[- ]level|graduate|intern)\b/.test(text)) {
    return "junior";
  }
  if (/\b(mid[- ]level|intermediate)\b/.test(text)) {
    return "mid";
  }
  return "unknown";
}

function titleExcluded(title: string): boolean {
  if (TITLE_EXCLUDE_PATTERNS.some((pattern) => pattern.test(title))) {
    const rescue =
      TITLE_FRONTEND_PATTERNS.some((pattern) => pattern.test(title)) &&
      /\b(frontend|react|web ui|design engineer)\b/i.test(title);
    return !rescue;
  }
  return false;
}

function hasReactFocus(title: string, description: string): boolean {
  if (titleExcluded(title)) {
    return false;
  }

  const titleMatch = TITLE_FRONTEND_PATTERNS.some((pattern) => pattern.test(title));
  if (titleMatch) {
    const titleLower = title.toLowerCase();
    const excludePrimary =
      EXCLUDE_STACK.some((stack) => titleLower.includes(stack)) &&
      !titleLower.includes("react");
    return !excludePrimary;
  }

  const descriptionSnippet = description.slice(0, 2500);
  const reactInDescription = DESCRIPTION_REACT_PATTERNS.some((pattern) =>
    pattern.test(descriptionSnippet),
  );
  const softwareEngineerTitle = /\bsoftware engineer\b/i.test(title);

  return softwareEngineerTitle && reactInDescription;
}

export function withGeoEligibility(posting: JobPosting): JobPosting {
  return {
    ...posting,
    geoEligibility: classifyGeoEligibility(posting),
  };
}

export function matchesScanCriteria(posting: JobPosting): {
  ok: boolean;
  reason?: string;
  geoEligibility?: GeoEligibility;
} {
  if (!hasReactFocus(posting.title, posting.description)) {
    return { ok: false, reason: "Not React/frontend focused" };
  }

  const geoEligibility = classifyGeoEligibility(posting);

  if (geoEligibility === "likely_excluded") {
    return { ok: false, reason: geoExclusionReason(posting), geoEligibility };
  }

  if (isRestrictedRemoteScope(posting.remoteScope) && geoEligibility !== "nigeria_eligible") {
    return {
      ok: false,
      reason: "Remote scope too restricted (US-only/hybrid/on-site)",
      geoEligibility,
    };
  }

  return { ok: true, geoEligibility };
}

export function filterPostings(postings: JobPosting[]): {
  matched: JobPosting[];
  excluded: Array<{ posting: JobPosting; reason: string }>;
} {
  const matched: JobPosting[] = [];
  const excluded: Array<{ posting: JobPosting; reason: string }> = [];

  for (const posting of postings) {
    const result = matchesScanCriteria(posting);
    if (result.ok) {
      matched.push(withGeoEligibility(posting));
    } else {
      excluded.push({
        posting: withGeoEligibility(posting),
        reason: result.reason ?? "Excluded",
      });
    }
  }

  return { matched, excluded };
}

export function inferRemoteScopeFromFields(
  location: string,
  description: string,
): RemoteScope {
  return classifyRemoteScope(location, description);
}

export function inferLevelFromFields(title: string, description: string): LevelHint {
  return classifyLevel(title, description);
}
