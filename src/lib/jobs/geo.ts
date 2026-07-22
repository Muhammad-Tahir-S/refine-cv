import type { GeoEligibility, JobPosting, RemoteScope } from "./types.js";
import type { GeoPolicy } from "./scan-policy.js";

/** Signals the role explicitly allows Nigeria, Africa, or unrestricted global hire. */
export const NIGERIA_POSITIVE_PATTERNS = [
  /\bnigeria\b/i,
  /\bafrica\b/i,
  /\bafrican\b/i,
  /\bemea timezones?\b/i,
  /\beurope,\s*the middle east and africa\b/i,
  /\bmiddle east and africa\b/i,
  /\bany country\b/i,
  /\banywhere (?:around the globe|in the world|on earth)\b/i,
  /\bwork from anywhere\b/i,
  /\bworldwide\b/i,
  /\bglobal(?:ly)? remote\b/i,
  /\bno location restriction\b/i,
  /\ball countries\b/i,
  /\bopen to (?:global|international|all) candidates\b/i,
  /\bopen to applicants located anywhere\b/i,
  /\bremote — anywhere\b/i,
  /\bremote \(worldwide\)\b/i,
];

/** Signals EU/UK/US-only hire or explicit Africa exclusion. */
export const GEO_EXCLUSION_PATTERNS = [
  /\bnot africa\b/i,
  /\b(?:excluding|except) africa\b/i,
  /\bgeo-limited,\s*not africa\b/i,
  /\beu only\b/i,
  /\beea only\b/i,
  /\beuropean union only\b/i,
  /\bright to work in (?:the )?(?:eu|eea|uk|europe|united kingdom)\b/i,
  /\b(?:eligible|legally authorized|legally entitled) to work in (?:the )?(?:eu|eea|uk|europe|united kingdom)\b/i,
  /\bmust be (?:based|located|resident|living) in (?:the )?(?:eu|eea|uk|europe|united kingdom)\b/i,
  /\b(?:must|need to) be based in (?:a )?(?:specific )?(?:eu|european|uk|eea)\b/i,
  /\buk (?:only|nationals?|citizens?|residents? only)\b/i,
  /\b(?:poland|germany|france|spain|italy|netherlands|ireland|sweden|portugal|romania|czechia|hungary|austria|belgium|denmark|finland|norway|switzerland) only\b/i,
  /\blocated in (?:the )?(?:united kingdom|uk|eu|europe|eea)\b/i,
  /\b(?:us|u\.s\.|united states) only\b/i,
  /\bwithin (?:the )?(?:eu|eea|uk)\b/i,
  /\b(?:eu|eea|uk) (?:citizens?|nationals?|passport)\b/i,
  /\bhybrid\b/i,
  /\bon-?site\b/i,
];

export function postingHaystack(
  posting: Pick<JobPosting, "location" | "description">,
): string {
  return `${posting.location}\n${posting.description}`;
}

function locationImpliesEmeaOnly(location: string): boolean {
  const loc = location.toLowerCase().trim();
  if (!loc) {
    return false;
  }
  if (/\bworldwide\b/i.test(loc) || /\bglobal(?:ly)?\b/i.test(loc)) {
    return false;
  }
  return /\bemea\b/i.test(loc) || /\bhome based - emea\b/i.test(loc);
}

function hasExplicitAfricaOrNigeriaSignal(haystack: string): boolean {
  return (
    /\bnigeria\b/i.test(haystack) ||
    /\bafrica\b/i.test(haystack) ||
    /\bafrican\b/i.test(haystack) ||
    /\bemea timezones?\b/i.test(haystack) ||
    /\beurope,\s*the middle east and africa\b/i.test(haystack) ||
    /\bmiddle east and africa\b/i.test(haystack)
  );
}

export function hasNigeriaPositiveSignal(haystack: string): boolean {
  return NIGERIA_POSITIVE_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function hasGeoExclusionSignal(haystack: string): boolean {
  return GEO_EXCLUSION_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function classifyGeoEligibility(
  posting: Pick<JobPosting, "location" | "description" | "remoteScope">,
  geoPolicy: GeoPolicy,
): GeoEligibility {
  const haystack = postingHaystack(posting);

  if (hasGeoExclusionSignal(haystack)) {
    return "likely_excluded";
  }

  if (
    geoPolicy.acceptEmeaOnlyWhenAfricaMentioned &&
    locationImpliesEmeaOnly(posting.location) &&
    !hasExplicitAfricaOrNigeriaSignal(haystack)
  ) {
    return geoPolicy.defaultEmeaToVerify ? "verify_geo" : "likely_excluded";
  }

  if (hasNigeriaPositiveSignal(haystack)) {
    return "nigeria_eligible";
  }

  if (posting.remoteScope === "global") {
    return geoPolicy.acceptGlobalRemote ? "nigeria_eligible" : "verify_geo";
  }

  if (posting.remoteScope === "regional") {
    return "likely_excluded";
  }

  if (posting.remoteScope === "emea" || posting.remoteScope === "unknown") {
    return geoPolicy.defaultEmeaToVerify ? "verify_geo" : "nigeria_eligible";
  }

  return geoPolicy.defaultEmeaToVerify ? "verify_geo" : "nigeria_eligible";
}

export function geoEligibilityLabel(eligibility: GeoEligibility): string {
  switch (eligibility) {
    case "nigeria_eligible":
      return "Nigeria-eligible";
    case "verify_geo":
      return "Verify geo";
    default:
      return "Likely excluded";
  }
}

export function geoExclusionReason(
  posting: Pick<JobPosting, "location" | "description" | "remoteScope">,
): string {
  const haystack = postingHaystack(posting);

  if (/\bnot africa\b/i.test(haystack) || /\b(?:excluding|except) africa\b/i.test(haystack)) {
    return "Geo restriction: Africa explicitly excluded";
  }
  if (hasGeoExclusionSignal(haystack)) {
    return "Geo restriction: EU/UK/US/hybrid/on-site signals in listing";
  }
  if (posting.remoteScope === "regional") {
    return "Remote scope too restricted (US-only/hybrid/on-site)";
  }
  return "Geo restriction: unlikely eligible from Nigeria";
}

export function isRestrictedRemoteScope(scope: RemoteScope): boolean {
  return scope === "regional";
}

export function withGeoEligibilityForPolicy(
  posting: JobPosting,
  geoPolicy: GeoPolicy,
): JobPosting {
  return {
    ...posting,
    geoEligibility: classifyGeoEligibility(posting, geoPolicy),
  };
}
