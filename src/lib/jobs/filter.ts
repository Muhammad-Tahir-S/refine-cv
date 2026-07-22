import {
  classifyGeoEligibility,
  geoExclusionReason,
  isRestrictedRemoteScope,
  withGeoEligibilityForPolicy,
} from "./geo.js";
import {
  isAllowedLevel,
  levelExclusionReason,
  type ScanPolicy,
} from "./scan-policy.js";
import { matchesRoleProfile, roleMismatchReason } from "./role-match.js";
import type { GeoEligibility, JobPosting, LevelHint, RemoteScope } from "./types.js";

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

export function classifyRemoteScope(
  location: string,
  description: string,
): RemoteScope {
  const loc = location.toLowerCase().trim();

  if (loc) {
    if (/\bhome based - worldwide\b/i.test(loc) || /\bworldwide\b/i.test(loc)) {
      return "global";
    }
    if (
      /\bhome based - emea\b/i.test(loc) ||
      (/\bemea\b/i.test(loc) && !/\bworldwide\b/i.test(loc))
    ) {
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

export function matchesScanCriteria(
  posting: JobPosting,
  policy: ScanPolicy,
): {
  ok: boolean;
  reason?: string;
  geoEligibility?: GeoEligibility;
} {
  if (!matchesRoleProfile(posting.title, posting.description, policy.roleProfile)) {
    return { ok: false, reason: roleMismatchReason(policy.roleProfile) };
  }

  if (!isAllowedLevel(posting.level, policy)) {
    return { ok: false, reason: levelExclusionReason(posting.level) };
  }

  const geoEligibility = classifyGeoEligibility(posting, policy.geo);

  if (geoEligibility === "likely_excluded") {
    return { ok: false, reason: geoExclusionReason(posting), geoEligibility };
  }

  if (
    isRestrictedRemoteScope(posting.remoteScope) &&
    geoEligibility !== "nigeria_eligible"
  ) {
    return {
      ok: false,
      reason: "Remote scope too restricted (US-only/hybrid/on-site)",
      geoEligibility,
    };
  }

  return { ok: true, geoEligibility };
}

export function filterPostings(
  postings: JobPosting[],
  policy: ScanPolicy,
): {
  matched: JobPosting[];
  excluded: Array<{ posting: JobPosting; reason: string }>;
} {
  const matched: JobPosting[] = [];
  const excluded: Array<{ posting: JobPosting; reason: string }> = [];

  for (const posting of postings) {
    const result = matchesScanCriteria(posting, policy);
    if (result.ok) {
      matched.push(withGeoEligibilityForPolicy(posting, policy.geo));
    } else {
      excluded.push({
        posting: withGeoEligibilityForPolicy(posting, policy.geo),
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

export function inferLevelFromFields(
  title: string,
  description: string,
): LevelHint {
  return classifyLevel(title, description);
}
