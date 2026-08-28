export interface VoyagerSearchHit {
  jobId: string;
  title: string;
  company: string;
  linkedinUrl: string;
  location?: string;
}

export interface VoyagerApplyInfo {
  externalApplyUrl?: string;
  easyApplyOnly: boolean;
}

export interface VoyagerJobDetail extends VoyagerApplyInfo {
  company?: string;
  location?: string;
  description?: string;
}

type VoyagerRecord = Record<string, unknown>;

function asRecord(value: unknown): VoyagerRecord | null {
  return value && typeof value === "object" ? (value as VoyagerRecord) : null;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  const record = asRecord(value);
  if (record && typeof record.text === "string") {
    return record.text.trim() || undefined;
  }
  return undefined;
}

export function extractJobIdFromUrn(urn: string): string | undefined {
  const match = urn.match(/jobPosting[:(](\d+)/i);
  return match?.[1];
}

function isJobPostingEntity(entity: VoyagerRecord): boolean {
  const urn = String(entity.entityUrn ?? "");
  const type = String(entity.$type ?? entity.type ?? "");
  return urn.includes("jobPosting") || type.includes("JobPosting");
}

function isCompanyEntity(entity: VoyagerRecord): boolean {
  const urn = String(entity.entityUrn ?? "");
  const type = String(entity.$type ?? entity.type ?? "");
  return (
    urn.includes("company") ||
    urn.includes("organization") ||
    type.includes("Company") ||
    type.includes("Organization")
  );
}

function companyNameFromEntity(entity: VoyagerRecord): string | undefined {
  return (
    textValue(entity.name) ??
    textValue(entity.companyName) ??
    textValue(entity.universalName)
  );
}

function resolveCompanyName(
  entity: VoyagerRecord,
  companiesByUrn: Map<string, string>,
): string | undefined {
  const direct =
    textValue(entity.companyName) ??
    textValue(entity.company) ??
    companyNameFromEntity(entity);

  if (direct) {
    return direct;
  }

  const companyRef = asRecord(entity.company);
  if (companyRef) {
    const fromRef =
      companyNameFromEntity(companyRef) ??
      companiesByUrn.get(String(companyRef.entityUrn ?? ""));
    if (fromRef) {
      return fromRef;
    }
  }

  for (const key of ["companyUrn", "companyDetails"]) {
    const value = entity[key];
    if (typeof value === "string" && companiesByUrn.has(value)) {
      return companiesByUrn.get(value);
    }
    const nested = asRecord(value);
    if (nested) {
      const urn = String(nested.entityUrn ?? "");
      if (urn && companiesByUrn.has(urn)) {
        return companiesByUrn.get(urn);
      }
    }
  }

  return undefined;
}

function companyFromLinkedInCompanyUrl(url: string): string | undefined {
  const match = url.match(/linkedin\.com\/company\/([^/?]+)/i);
  if (!match?.[1]) {
    return undefined;
  }
  const slug = decodeURIComponent(match[1]);
  return slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function isJobPostingCardEntity(entity: VoyagerRecord): boolean {
  const urn = String(entity.entityUrn ?? "");
  return urn.includes("jobPostingCard");
}

function locationFromRecord(record: VoyagerRecord): string | undefined {
  return (
    textValue(record.formattedLocation) ??
    textValue(record.locationDescription) ??
    textValue(record.defaultLocalizedName) ??
    textValue(record.shortLocationName) ??
    textValue(record.secondaryDescription)
  );
}

function descriptionFromRecord(record: VoyagerRecord): string | undefined {
  const direct =
    textValue(record.description) ??
    textValue(record.jobDescription) ??
    textValue(record.descriptionText);
  if (direct) {
    return direct;
  }

  const nested = asRecord(record.description);
  if (nested) {
    return textValue(nested.text) ?? textValue(nested.rawText);
  }

  const localized = asRecord(record.localizedDescription);
  if (localized) {
    return textValue(localized.rawText) ?? textValue(localized.text);
  }

  return undefined;
}

function hitFromJobPostingCard(entity: VoyagerRecord): VoyagerSearchHit | null {
  const urn = String(entity.entityUrn ?? "");
  const jobId = extractJobIdFromUrn(urn);
  const title = textValue(entity.title);
  const logoAction = String(asRecord(entity.logo)?.actionTarget ?? "");
  const company =
    companyFromLinkedInCompanyUrl(logoAction) ??
    textValue(entity.subtitle) ??
    textValue(entity.primaryDescription) ??
    "Unknown";
  const location = locationFromRecord(entity);

  if (!jobId || !title) {
    return null;
  }

  return {
    jobId,
    title,
    company,
    linkedinUrl: `https://www.linkedin.com/jobs/view/${jobId}/`,
    location,
  };
}

function hitFromJobEntity(
  entity: VoyagerRecord,
  companiesByUrn: Map<string, string>,
): VoyagerSearchHit | null {
  const urn = String(entity.entityUrn ?? "");
  const jobId = extractJobIdFromUrn(urn) ?? String(entity.jobPostingId ?? entity.dashJobPostingUrn ?? "");
  const numericId = extractJobIdFromUrn(jobId) ?? (/^\d+$/.test(jobId) ? jobId : extractJobIdFromUrn(urn));
  const title = textValue(entity.title) ?? textValue(entity.jobTitle);
  const company = resolveCompanyName(entity, companiesByUrn) ?? "Unknown";

  if (!numericId || !title) {
    return null;
  }

  return {
    jobId: numericId,
    title,
    company,
    linkedinUrl: `https://www.linkedin.com/jobs/view/${numericId}/`,
    location: locationFromRecord(entity),
  };
}

function indexCompanies(included: unknown[]): Map<string, string> {
  const companiesByUrn = new Map<string, string>();

  for (const item of included) {
    const entity = asRecord(item);
    if (!entity || !isCompanyEntity(entity)) {
      continue;
    }
    const urn = String(entity.entityUrn ?? "");
    const name = companyNameFromEntity(entity);
    if (urn && name) {
      companiesByUrn.set(urn, name);
    }
  }

  return companiesByUrn;
}

function collectIncluded(payload: VoyagerRecord): unknown[] {
  const included = Array.isArray(payload.included) ? payload.included : [];
  const data = asRecord(payload.data);
  const nestedIncluded = data && Array.isArray(data.included) ? data.included : [];
  return [...included, ...nestedIncluded];
}

export function parseVoyagerSearchPayloads(payloads: unknown[]): VoyagerSearchHit[] {
  const hits: VoyagerSearchHit[] = [];
  const seen = new Set<string>();

  for (const payload of payloads) {
    const root = asRecord(payload);
    if (!root) {
      continue;
    }

    const included = collectIncluded(root);
    const companiesByUrn = indexCompanies(included);

    for (const item of included) {
      const entity = asRecord(item);
      if (!entity) {
        continue;
      }

      if (isJobPostingCardEntity(entity)) {
        const cardHit = hitFromJobPostingCard(entity);
        if (cardHit && !seen.has(cardHit.jobId)) {
          seen.add(cardHit.jobId);
          hits.push(cardHit);
        }
        continue;
      }

      if (!isJobPostingEntity(entity)) {
        continue;
      }

      const hit = hitFromJobEntity(entity, companiesByUrn);
      if (hit && !seen.has(hit.jobId)) {
        seen.add(hit.jobId);
        hits.push(hit);
      }
    }

    // Some responses nest job cards under data.elements referencing posting URNs
    const data = asRecord(root.data);
    const elements = data && Array.isArray(data.elements) ? data.elements : [];
    for (const element of elements) {
      const el = asRecord(element);
      if (!el) {
        continue;
      }
      const urn = String(el.jobPostingUrn ?? el.entityUrn ?? "");
      const jobId = extractJobIdFromUrn(urn);
      const title = textValue(el.title) ?? textValue(el.jobTitle);
      if (!jobId || !title) {
        continue;
      }
      const company =
        textValue(el.companyName) ??
        resolveCompanyName(el, companiesByUrn) ??
        "Unknown";
      if (!seen.has(jobId)) {
        seen.add(jobId);
        hits.push({
          jobId,
          title,
          company,
          linkedinUrl: `https://www.linkedin.com/jobs/view/${jobId}/`,
          location: locationFromRecord(el),
        });
      }
    }
  }

  return hits;
}

function findApplyInRecord(record: VoyagerRecord): VoyagerApplyInfo | null {
  const applyMethod = asRecord(record.applyMethod);
  if (applyMethod) {
    const type = String(applyMethod.$type ?? applyMethod.type ?? "");
    const offsite = asRecord(applyMethod.offsiteApply) ?? asRecord(applyMethod.companyApplyUrl);
    const companyApplyUrl =
      textValue(applyMethod.companyApplyUrl) ??
      textValue(offsite?.companyApplyUrl) ??
      textValue(offsite?.url);

    if (companyApplyUrl && !companyApplyUrl.includes("linkedin.com")) {
      return { externalApplyUrl: companyApplyUrl, easyApplyOnly: false };
    }

    const isEasyApply =
      type.includes("ComplexOnsiteApply") ||
      type.includes("SimpleOnsiteApply") ||
      type.includes("OnsiteApply");

    if (isEasyApply) {
      return { easyApplyOnly: true };
    }
  }

  // Walk one level deep for nested apply info
  for (const value of Object.values(record)) {
    const nested = asRecord(value);
    if (!nested) {
      continue;
    }
    const found = findApplyInRecord(nested);
    if (found) {
      return found;
    }
  }

  return null;
}

export function parseCompanyFromJobDetail(payload: unknown): string | undefined {
  const root = asRecord(payload);
  if (!root) {
    return undefined;
  }

  const fromRoot =
    textValue(root.companyName) ??
    textValue(root.company) ??
    companyNameFromEntity(root);
  if (fromRoot) {
    return fromRoot;
  }

  for (const item of collectIncluded(root)) {
    const entity = asRecord(item);
    if (!entity) {
      continue;
    }
    if (isCompanyEntity(entity)) {
      const name = companyNameFromEntity(entity);
      if (name) {
        return name;
      }
    }
    if (isJobPostingEntity(entity)) {
      const name =
        textValue(entity.companyName) ??
        textValue(entity.company) ??
        companyNameFromEntity(entity);
      if (name) {
        return name;
      }
    }
  }

  return undefined;
}

function parseLocationFromJobDetail(payload: unknown): string | undefined {
  const root = asRecord(payload);
  if (!root) {
    return undefined;
  }

  const fromRoot = locationFromRecord(root);
  if (fromRoot) {
    return fromRoot;
  }

  const data = asRecord(root.data);
  if (data) {
    const fromData = locationFromRecord(data);
    if (fromData) {
      return fromData;
    }
  }

  for (const item of collectIncluded(root)) {
    const entity = asRecord(item);
    if (!entity) {
      continue;
    }
    if (isJobPostingEntity(entity)) {
      const location = locationFromRecord(entity);
      if (location) {
        return location;
      }
    }
  }

  return undefined;
}

function parseDescriptionFromJobDetail(payload: unknown): string | undefined {
  const root = asRecord(payload);
  if (!root) {
    return undefined;
  }

  const fromRoot = descriptionFromRecord(root);
  if (fromRoot) {
    return fromRoot;
  }

  const data = asRecord(root.data);
  if (data) {
    const fromData = descriptionFromRecord(data);
    if (fromData) {
      return fromData;
    }
  }

  for (const item of collectIncluded(root)) {
    const entity = asRecord(item);
    if (!entity) {
      continue;
    }
    if (isJobPostingEntity(entity)) {
      const description = descriptionFromRecord(entity);
      if (description) {
        return description;
      }
    }
  }

  return undefined;
}

export function parseVoyagerJobDetailPayload(payload: unknown): VoyagerJobDetail {
  const root = asRecord(payload);
  if (!root) {
    return { easyApplyOnly: false };
  }

  const company = parseCompanyFromJobDetail(payload);
  const location = parseLocationFromJobDetail(payload);
  const description = parseDescriptionFromJobDetail(payload);
  const direct = findApplyInRecord(root);
  if (direct) {
    return { ...direct, company, location, description };
  }

  for (const item of collectIncluded(root)) {
    const entity = asRecord(item);
    if (!entity) {
      continue;
    }
    const found = findApplyInRecord(entity);
    if (found) {
      return { ...found, company, location, description };
    }
  }

  return { easyApplyOnly: false, company, location, description };
}

export function companyFromApplyUrl(url: string): string | undefined {
  const patterns = [
    /greenhouse\.io\/([^/?]+)/i,
    /lever\.co\/([^/?]+)/i,
    /ashbyhq\.com\/([^/?]+)/i,
    /apply\.workable\.com\/([^/]+)\/j\//i,
    /myworkdayjobs\.com\/([^/?]+)/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1] && match[1] !== "job-boards" && match[1] !== "apply") {
      return match[1]
        .split(/[-_]/)
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
        .join(" ");
    }
  }

  return undefined;
}

export function buildVoyagerDetailUrls(jobId: string): string[] {
  return [
    `https://www.linkedin.com/voyager/api/jobs/jobPostings/${jobId}`,
    `https://www.linkedin.com/voyager/api/voyagerJobsDashJobPostings?decorationId=com.linkedin.voyager.dash.deco.jobs.FullJobPosting-116&jobPostingUrn=urn:li:fsd_jobPosting:${jobId}`,
  ];
}

export function isVoyagerJobCardsResponse(url: string): boolean {
  return (
    url.includes("/voyager/api/voyagerJobsDashJobCards") ||
    (url.includes("/voyager/api/graphql") && url.includes("jobSearch"))
  );
}
