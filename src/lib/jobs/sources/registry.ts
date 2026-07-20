import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { paths } from "../../paths.js";
import type { JobSourceEntry, JobSourcesConfig } from "../types.js";

const JobSourceEntrySchema = z.object({
  id: z.string(),
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
  minPollHours: z.number().optional(),
  attribution: z.string().optional(),
  query: z.string().optional(),
  worldwide: z.boolean().optional(),
  maxPages: z.number().optional(),
  tag: z.string().optional(),
  count: z.number().optional(),
  search: z.string().optional(),
  category: z.string().optional(),
  tags: z.string().optional(),
  feeds: z.array(z.string()).optional(),
});

const JobSourcesConfigSchema = z.object({
  version: z.number(),
  attribution: z.string().optional(),
  sources: z.array(JobSourceEntrySchema),
});

export function loadJobSourcesConfig(): JobSourcesConfig {
  const configPath = paths.jobSourcesConfig;
  if (!existsSync(configPath)) {
    throw new Error(`Missing job sources config: ${configPath}`);
  }
  return JobSourcesConfigSchema.parse(JSON.parse(readFileSync(configPath, "utf8")));
}

export function getEnabledSources(config: JobSourcesConfig = loadJobSourcesConfig()): JobSourceEntry[] {
  return config.sources.filter((source) => source.enabled);
}
