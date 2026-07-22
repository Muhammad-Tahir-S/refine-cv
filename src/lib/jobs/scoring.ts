import {
  hasGeoExclusionSignal,
  hasNigeriaPositiveSignal,
  postingHaystack,
} from "./geo.js";
import { matchesRoleProfile } from "./role-match.js";
import type { RoleProfile } from "./role-profile.js";
import { lookupLifecycleDisposition } from "./state.js";
import type {
  GeoEligibility,
  JobLifecycleState,
  JobPosting,
  JobScoreBreakdown,
  LifecycleSuppressedCounts,
  RankedJob,
  ScanEffectivenessMetrics,
  SourceStats,
  SourceYieldStats,
} from "./types.js";

export type {
  JobScoreBreakdown,
  RankedJob,
  ScanEffectivenessMetrics,
  SourceYieldStats,
} from "./types.js";

const RELEVANCE_WEIGHT = 0.5;
const GEO_CONFIDENCE_WEIGHT = 0.3;
const FRESHNESS_WEIGHT = 0.2;

/** Days after which a listing is flagged likelyExpired (does not mutate lifecycle). */
export const LIKELY_EXPIRED_DAYS = 75;

const REACT_TITLE_STRONG = [
  /\breact\b/i,
  /\bfrontend\b/i,
  /\bfront-end\b/i,
  /\bfront end\b/i,
  /\bnext\.?js\b/i,
  /\bweb engineer\b/i,
  /\bui engineer\b/i,
  /\bdesign engineer\b/i,
];

const REACT_TITLE_MODERATE = [
  /\bweb developer\b/i,
  /\bproduct engineer\b/i,
  /\bjavascript engineer\b/i,
  /\btypescript engineer\b/i,
  /\bfull[- ]stack\b/i,
  /\bfullstack\b/i,
];

const NODEJS_TITLE_STRONG = [
  /\bnode\.?js\b/i,
  /\bnestjs\b/i,
  /\bexpress\b/i,
];

const NODEJS_TITLE_MODERATE = [
  /\bbackend engineer\b/i,
  /\bback-end engineer\b/i,
  /\bback end engineer\b/i,
  /\bserver[- ]side\b/i,
  /\bapi engineer\b/i,
  /\bbackend developer\b/i,
];

const NODEJS_DESCRIPTION_SIGNALS = [/\bnode\.?js\b/i, /\bnestjs\b/i, /\bexpress\b/i];
const REACT_DESCRIPTION_SIGNALS = [/\breact\b/i, /\bnext\.?js\b/i];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function compositeTotal(
  relevance: number,
  geoConfidence: number,
  freshness: number,
): number {
  return roundScore(
    relevance * RELEVANCE_WEIGHT +
      geoConfidence * GEO_CONFIDENCE_WEIGHT +
      freshness * FRESHNESS_WEIGHT,
  );
}

function countPatternMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(text)).length;
}

export function scoreRelevance(
  posting: Pick<JobPosting, "title" | "description">,
  roleProfile: RoleProfile,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const { title, description } = posting;
  const descriptionSnippet = description.slice(0, 2500);

  if (roleProfile === "reactFrontend") {
    const strongHits = countPatternMatches(title, REACT_TITLE_STRONG);
    const moderateHits = countPatternMatches(title, REACT_TITLE_MODERATE);

    if (strongHits >= 2) {
      reasons.push("Title has multiple strong React/frontend signals");
      return { score: 0.95, reasons };
    }
    if (strongHits === 1) {
      reasons.push("Title has explicit React/frontend signal");
      return { score: 0.85, reasons };
    }
    if (moderateHits >= 1) {
      reasons.push("Title has moderate frontend/web signals");
      return { score: 0.7, reasons };
    }
    if (
      /\bsoftware engineer\b/i.test(title) &&
      REACT_DESCRIPTION_SIGNALS.some((pattern) => pattern.test(descriptionSnippet))
    ) {
      reasons.push("Generic software engineer title with React in description");
      return { score: 0.65, reasons };
    }
    if (matchesRoleProfile(title, description, roleProfile)) {
      reasons.push("Passes role filter with weak title signals");
      return { score: 0.55, reasons };
    }
    reasons.push("Minimal React/frontend alignment");
    return { score: 0.35, reasons };
  }

  const strongHits = countPatternMatches(title, NODEJS_TITLE_STRONG);
  const moderateHits = countPatternMatches(title, NODEJS_TITLE_MODERATE);
  const descHits = countPatternMatches(descriptionSnippet, NODEJS_DESCRIPTION_SIGNALS);

  if (strongHits >= 1) {
    reasons.push("Title has explicit Node.js/backend stack signal");
    return { score: 0.95, reasons };
  }
  if (moderateHits >= 1 && descHits >= 1) {
    reasons.push("Backend title with Node.js/NestJS/Express in description");
    return { score: 0.8, reasons };
  }
  if (moderateHits >= 1) {
    reasons.push("Generic backend title without strong stack mention");
    return { score: 0.6, reasons };
  }
  if (matchesRoleProfile(title, description, roleProfile)) {
    reasons.push("Passes role filter with indirect backend signals");
    return { score: 0.5, reasons };
  }
  reasons.push("Minimal Node.js/backend alignment");
  return { score: 0.35, reasons };
}

export function scoreGeoConfidence(
  posting: Pick<JobPosting, "location" | "description" | "remoteScope" | "geoEligibility">,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const haystack = postingHaystack(posting);

  if (/\bnigeria\b/i.test(haystack)) {
    reasons.push("Explicit Nigeria hire signal");
    return { score: 0.98, reasons };
  }
  if (/\bafrica\b/i.test(haystack) || /\bafrican\b/i.test(haystack)) {
    reasons.push("Explicit Africa hire signal");
    return { score: 0.95, reasons };
  }
  if (hasNigeriaPositiveSignal(haystack)) {
    reasons.push("Worldwide or unrestricted global remote signal");
    return { score: 0.9, reasons };
  }
  if (posting.remoteScope === "global") {
    reasons.push("Classified as global remote scope");
    return { score: 0.85, reasons };
  }
  if (hasGeoExclusionSignal(haystack)) {
    reasons.push("EU/UK/US-only or hybrid/on-site restriction signals");
    return { score: 0.15, reasons };
  }
  if (posting.geoEligibility === "verify_geo") {
    if (posting.remoteScope === "emea") {
      reasons.push("EMEA/regional scope — verify Nigeria eligibility manually");
      return { score: 0.35, reasons };
    }
    reasons.push("Unclear remote scope — manual geo verification recommended");
    return { score: 0.45, reasons };
  }
  if (posting.remoteScope === "unknown") {
    reasons.push("Remote mentioned but scope unclear");
    return { score: 0.5, reasons };
  }
  if (posting.geoEligibility === "nigeria_eligible") {
    reasons.push("Hard filter marked Nigeria-eligible without explicit geo text");
    return { score: 0.75, reasons };
  }
  reasons.push("Geo signals ambiguous");
  return { score: 0.4, reasons };
}

export function scoreFreshness(
  posting: Pick<JobPosting, "postedAt" | "fetchedAt">,
  referenceDate: Date = new Date(),
): { score: number; reasons: string[]; likelyExpired: boolean } {
  const reasons: string[] = [];

  if (!posting.postedAt) {
    reasons.push("No postedAt date — conservative freshness estimate");
    return { score: 0.4, reasons, likelyExpired: false };
  }

  const postedMs = Date.parse(posting.postedAt);
  if (Number.isNaN(postedMs)) {
    reasons.push("Unparseable postedAt — conservative freshness estimate");
    return { score: 0.35, reasons, likelyExpired: false };
  }

  const ageDays = Math.max(
    0,
    (referenceDate.getTime() - postedMs) / (1000 * 60 * 60 * 24),
  );

  if (ageDays <= 7) {
    reasons.push(`Posted ${Math.round(ageDays)} day(s) ago — very fresh`);
    return { score: 1, reasons, likelyExpired: false };
  }
  if (ageDays <= 14) {
    reasons.push(`Posted ${Math.round(ageDays)} days ago — fresh`);
    return { score: 0.9, reasons, likelyExpired: false };
  }
  if (ageDays <= 30) {
    reasons.push(`Posted ${Math.round(ageDays)} days ago — recent`);
    return { score: 0.75, reasons, likelyExpired: false };
  }
  if (ageDays <= 45) {
    reasons.push(`Posted ${Math.round(ageDays)} days ago — aging`);
    return { score: 0.55, reasons, likelyExpired: false };
  }
  if (ageDays <= LIKELY_EXPIRED_DAYS) {
    reasons.push(`Posted ${Math.round(ageDays)} days ago — stale`);
    return { score: 0.35, reasons, likelyExpired: false };
  }

  reasons.push(
    `Posted ${Math.round(ageDays)} days ago — likely expired (>${LIKELY_EXPIRED_DAYS}d)`,
  );
  return { score: 0.15, reasons, likelyExpired: true };
}

export function scoreJobPosting(
  posting: JobPosting,
  roleProfile: RoleProfile,
  referenceDate: Date = new Date(),
): JobScoreBreakdown {
  const relevanceResult = scoreRelevance(posting, roleProfile);
  const geoResult = scoreGeoConfidence(posting);
  const freshnessResult = scoreFreshness(posting, referenceDate);

  const relevance = roundScore(clamp01(relevanceResult.score));
  const geoConfidence = roundScore(clamp01(geoResult.score));
  const freshness = roundScore(clamp01(freshnessResult.score));
  const reasons = [
    `Relevance: ${relevanceResult.reasons[0] ?? "scored"}`,
    `Geo confidence: ${geoResult.reasons[0] ?? "scored"}`,
    `Freshness: ${freshnessResult.reasons[0] ?? "scored"}`,
  ];

  const breakdown: JobScoreBreakdown = {
    relevance,
    geoConfidence,
    freshness,
    total: compositeTotal(relevance, geoConfidence, freshness),
    reasons,
  };

  if (freshnessResult.likelyExpired) {
    breakdown.likelyExpired = true;
  }

  return breakdown;
}

function geoTierRank(eligibility: GeoEligibility | undefined): number {
  switch (eligibility) {
    case "nigeria_eligible":
      return 0;
    case "verify_geo":
      return 1;
    default:
      return 2;
  }
}

export function compareRankedJobs(a: RankedJob, b: RankedJob): number {
  const geoDiff =
    geoTierRank(a.posting.geoEligibility) - geoTierRank(b.posting.geoEligibility);
  if (geoDiff !== 0) {
    return geoDiff;
  }

  const totalDiff = b.score.total - a.score.total;
  if (totalDiff !== 0) {
    return totalDiff;
  }

  const companyDiff = a.posting.company.localeCompare(b.posting.company);
  if (companyDiff !== 0) {
    return companyDiff;
  }

  return a.posting.dedupeKey.localeCompare(b.posting.dedupeKey);
}

export function rankMatchedJobs(
  postings: JobPosting[],
  roleProfile: RoleProfile,
  referenceDate: Date = new Date(),
): RankedJob[] {
  return postings
    .map((posting) => ({
      posting,
      score: scoreJobPosting(posting, roleProfile, referenceDate),
    }))
    .sort(compareRankedJobs);
}

function configuredSourceIdsForPosting(posting: JobPosting): string[] {
  const ids =
    posting.configuredSourceIds.length > 0
      ? posting.configuredSourceIds
      : posting.provenance.map((record) => record.configuredSourceId);
  return [...new Set(ids)];
}

export interface ComputeEffectivenessMetricsInput {
  policyMatched: JobPosting[];
  newJobs: JobPosting[];
  previouslySeen: JobPosting[];
  lifecycleSuppressed: LifecycleSuppressedCounts;
  lifecycleState: JobLifecycleState;
  sourceStats: SourceStats[];
  roleProfile: RoleProfile;
  referenceDate?: Date;
}

export function computeEffectivenessMetrics(
  input: ComputeEffectivenessMetricsInput,
): ScanEffectivenessMetrics {
  const {
    policyMatched,
    newJobs,
    previouslySeen,
    lifecycleSuppressed,
    lifecycleState,
    sourceStats,
    roleProfile,
    referenceDate = new Date(),
  } = input;

  const newKeys = new Set(newJobs.map((job) => job.dedupeKey));
  const seenKeys = new Set(previouslySeen.map((job) => job.dedupeKey));

  const perSource: Map<string, SourceYieldStats> = new Map(
    sourceStats.map((stat) => [
      stat.sourceId,
      {
        sourceId: stat.sourceId,
        fetched: stat.fetched,
        matched: 0,
        new: 0,
        previouslySeen: 0,
        suppressed: { applied: 0, dismissed: 0, expired: 0 },
        yieldRate: stat.fetched > 0 ? roundScore(stat.matched / stat.fetched) : null,
        likelyExpiredAmongMatched: 0,
      },
    ]),
  );

  let likelyExpiredAmongMatched = 0;
  let dismissedAmongMatched = 0;

  for (const posting of policyMatched) {
    const score = scoreJobPosting(posting, roleProfile, referenceDate);
    if (score.likelyExpired) {
      likelyExpiredAmongMatched += 1;
    }

    const disposition = lookupLifecycleDisposition(posting, lifecycleState);
    if (disposition === "dismissed") {
      dismissedAmongMatched += 1;
    }

    for (const sourceId of configuredSourceIdsForPosting(posting)) {
      const stats = perSource.get(sourceId);
      if (!stats) {
        continue;
      }
      stats.matched += 1;
      if (score.likelyExpired) {
        stats.likelyExpiredAmongMatched += 1;
      }
      if (disposition) {
        stats.suppressed[disposition] += 1;
      } else if (newKeys.has(posting.dedupeKey)) {
        stats.new += 1;
      } else if (seenKeys.has(posting.dedupeKey)) {
        stats.previouslySeen += 1;
      }
    }
  }

  for (const stats of perSource.values()) {
    stats.yieldRate =
      stats.fetched > 0 ? roundScore(stats.matched / stats.fetched) : null;
  }

  const falsePositiveProxy =
    policyMatched.length > 0
      ? roundScore(dismissedAmongMatched / policyMatched.length)
      : null;

  return {
    sourceYield: [...perSource.values()],
    falsePositiveProxy,
    likelyExpiredAmongMatched,
    lifecycleSuppressed,
  };
}

export function formatScoreSummary(score: JobScoreBreakdown): string {
  const parts = [
    `rel ${score.relevance.toFixed(2)}`,
    `geo ${score.geoConfidence.toFixed(2)}`,
    `fresh ${score.freshness.toFixed(2)}`,
    `total ${score.total.toFixed(2)}`,
  ];
  if (score.likelyExpired) {
    parts.push("likely expired");
  }
  return parts.join(", ");
}
