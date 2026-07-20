import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { paths } from "../../paths.js";
import type { JobSourceEntry, JobSourcesConfig } from "../types.js";
import {
  ProfileSourceOptionsSchema,
  validateJobSourceEntry,
  type JobSourceEntryWithProfiles,
} from "./source-options.js";

const ProfileOptionsByRoleSchema = z
  .object({
    reactFrontend: ProfileSourceOptionsSchema.optional(),
    nodejsBackend: ProfileSourceOptionsSchema.optional(),
  })
  .strict();

export const JobSourceEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    adapter: z.enum([
      "himalayas",
      "jobicy",
      "remotive",
      "arbeitnow",
      "remoteok",
      "wwr",
      "hn-hiring",
    ]),
    enabled: z.boolean(),
    minPollHours: z.number().int().min(0).max(8760).optional(),
    attribution: z.string().min(1).optional(),
    profileOptions: ProfileOptionsByRoleSchema.optional(),
    query: ProfileSourceOptionsSchema.shape.query,
    worldwide: ProfileSourceOptionsSchema.shape.worldwide,
    maxPages: ProfileSourceOptionsSchema.shape.maxPages,
    tag: ProfileSourceOptionsSchema.shape.tag,
    count: ProfileSourceOptionsSchema.shape.count,
    search: ProfileSourceOptionsSchema.shape.search,
    category: ProfileSourceOptionsSchema.shape.category,
    tags: ProfileSourceOptionsSchema.shape.tags,
    feeds: ProfileSourceOptionsSchema.shape.feeds,
  })
  .strict()
  .superRefine((source, context) => {
    try {
      validateJobSourceEntry(source as JobSourceEntryWithProfiles);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

export const JobSourcesConfigSchema = z
  .object({
    version: z.number().int().min(1),
    attribution: z.string().min(1).optional(),
    sources: z.array(JobSourceEntrySchema),
  })
  .strict()
  .superRefine((config, context) => {
    const seen = new Set<string>();
    config.sources.forEach((source, index) => {
      if (seen.has(source.id)) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "id"],
          message: `Duplicate configured source id "${source.id}".`,
        });
      }
      seen.add(source.id);
    });
  });

export function parseJobSourcesConfig(input: unknown): JobSourcesConfig {
  return JobSourcesConfigSchema.parse(input) as JobSourcesConfig;
}

export function loadJobSourcesConfig(): JobSourcesConfig {
  const configPath = paths.jobSourcesConfig;
  if (!existsSync(configPath)) {
    throw new Error(`Missing job sources config: ${configPath}`);
  }
  return parseJobSourcesConfig(JSON.parse(readFileSync(configPath, "utf8")));
}

export function getEnabledSources(config: JobSourcesConfig = loadJobSourcesConfig()): JobSourceEntry[] {
  return config.sources.filter((source) => source.enabled);
}
