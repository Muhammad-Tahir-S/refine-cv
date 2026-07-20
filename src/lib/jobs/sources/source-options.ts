import { z } from "zod";
import type { RoleProfile } from "../role-profile.js";
import type { JobSourceEntry } from "../types.js";

export const PROFILE_OPTION_FIELDS = [
  "query",
  "worldwide",
  "maxPages",
  "tag",
  "count",
  "search",
  "category",
  "tags",
  "feeds",
] as const;

export const ProfileSourceOptionsSchema = z
  .object({
    query: z.string().min(1).optional(),
    worldwide: z.boolean().optional(),
    maxPages: z.number().int().min(1).max(10).optional(),
    tag: z.string().min(1).optional(),
    count: z.number().int().min(1).max(200).optional(),
    search: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    tags: z.string().min(1).optional(),
    feeds: z.array(z.string().min(1)).min(1).max(8).optional(),
  })
  .strict();

export type ProfileSourceOptions = z.infer<typeof ProfileSourceOptionsSchema>;

export interface JobSourceEntryWithProfiles extends JobSourceEntry {
  profileOptions?: Partial<Record<RoleProfile, ProfileSourceOptions>>;
}

export const BOARD_ADAPTERS = [
  "himalayas",
  "jobicy",
  "remotive",
  "arbeitnow",
  "remoteok",
  "wwr",
  "hn-hiring",
] as const;

type BoardAdapterId = (typeof BOARD_ADAPTERS)[number];

export const ADAPTER_SUPPORTED_FIELDS: Record<
  BoardAdapterId,
  readonly (keyof ProfileSourceOptions)[]
> = {
  himalayas: ["query", "worldwide", "maxPages"],
  jobicy: ["tag", "count"],
  remotive: ["search", "category"],
  arbeitnow: ["maxPages"],
  remoteok: ["tags"],
  wwr: ["feeds"],
  "hn-hiring": [],
};

function collectConfiguredOptionKeys(
  source: JobSourceEntryWithProfiles,
): Set<keyof ProfileSourceOptions> {
  const keys = new Set<keyof ProfileSourceOptions>();
  for (const field of PROFILE_OPTION_FIELDS) {
    if (source[field] !== undefined) {
      keys.add(field);
    }
  }
  for (const profileOptions of Object.values(source.profileOptions ?? {})) {
    for (const field of PROFILE_OPTION_FIELDS) {
      if (profileOptions?.[field] !== undefined) {
        keys.add(field);
      }
    }
  }
  return keys;
}

export function validateJobSourceEntry(source: JobSourceEntryWithProfiles): void {
  if (!BOARD_ADAPTERS.includes(source.adapter as BoardAdapterId)) {
    return;
  }
  const adapter = source.adapter as BoardAdapterId;

  if (source.profileOptions) {
    const reactOptions = source.profileOptions.reactFrontend;
    const backendOptions = source.profileOptions.nodejsBackend;
    if (
      ADAPTER_SUPPORTED_FIELDS[adapter].length > 0 &&
      (!reactOptions ||
        !backendOptions ||
        Object.keys(reactOptions).length === 0 ||
        Object.keys(backendOptions).length === 0)
    ) {
      throw new Error(
        `Source "${source.id}" (${source.adapter}): profileOptions must define non-empty ` +
          "reactFrontend and nodejsBackend options.",
      );
    }

    for (const [profile, options] of Object.entries(source.profileOptions)) {
      if (profile !== "reactFrontend" && profile !== "nodejsBackend") {
        throw new Error(
          `Source "${source.id}": unknown profileOptions key "${profile}". Use reactFrontend or nodejsBackend.`,
        );
      }
      ProfileSourceOptionsSchema.parse(options);
    }
  }

  const configured = collectConfiguredOptionKeys(source);
  const supported = new Set(ADAPTER_SUPPORTED_FIELDS[adapter]);

  for (const key of configured) {
    if (!supported.has(key)) {
      throw new Error(
        `Source "${source.id}" (${source.adapter}): unsupported option "${String(key)}". ` +
          `Supported: ${[...supported].join(", ") || "none"}.`,
      );
    }
  }

}

export function resolveEffectiveSourceOptions(
  source: JobSourceEntryWithProfiles,
  profile: RoleProfile,
): JobSourceEntry {
  const profileOverrides = source.profileOptions?.[profile] ?? {};
  const merged: JobSourceEntry = { ...source, ...profileOverrides };

  delete (merged as JobSourceEntryWithProfiles).profileOptions;
  return merged;
}

export function getAdapterRequestSummary(
  source: JobSourceEntry,
  requestUrl: string,
): { requestUrl: string; attribution?: string } {
  return {
    requestUrl,
    attribution: source.attribution,
  };
}
