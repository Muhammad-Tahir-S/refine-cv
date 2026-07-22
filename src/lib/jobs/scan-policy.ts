import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { paths } from "../paths.js";
import {
  parseRoleProfile,
  resolveRoleProfileFromConfig,
  roleProfileLabel,
  type RoleProfile,
} from "./role-profile.js";
import type { LevelHint } from "./types.js";

const LEVEL_HINTS = [
  "junior",
  "mid",
  "senior",
  "staff_lead",
  "unknown",
] as const satisfies readonly LevelHint[];

const LevelHintSchema = z.enum(LEVEL_HINTS);

export const JobSearchConfigSchema = z.object({
  version: z.number(),
  applicant: z.object({
    name: z.string().optional(),
    location: z.string(),
    citizenship: z.string(),
    workPermitCountries: z.array(z.string()),
  }),
  geoEligibility: z.object({
    summary: z.string(),
    acceptGlobalRemote: z.boolean(),
    acceptEmeaOnlyWhenAfricaMentioned: z.boolean(),
    defaultEmeaToVerify: z.boolean(),
  }),
  roleFilters: z.object({
    reactFrontend: z.boolean().optional(),
    profile: z.enum(["reactFrontend", "nodejsBackend"]).optional(),
    levels: z.array(LevelHintSchema).min(1),
  }),
  blocklist: z.array(z.string()).default([]),
  _comment: z.string().optional(),
});

export type JobSearchConfig = z.infer<typeof JobSearchConfigSchema>;

export interface GeoPolicy {
  acceptGlobalRemote: boolean;
  acceptEmeaOnlyWhenAfricaMentioned: boolean;
  defaultEmeaToVerify: boolean;
  summary: string;
}

export interface ApplicantContext {
  location: string;
  citizenship: string;
  workPermitCountries: string[];
  name?: string;
}

export interface ScanPolicy {
  configPath: string;
  configLabel: string;
  roleProfile: RoleProfile;
  allowedLevels: LevelHint[];
  geo: GeoPolicy;
  applicant: ApplicantContext;
  blocklist: string[];
}

export interface SerializedScanPolicy {
  configLabel: string;
  roleProfile: RoleProfile;
  roleProfileLabel: string;
  allowedLevels: LevelHint[];
  geo: GeoPolicy;
  applicant: ApplicantContext;
  blocklistCount: number;
}

export interface ScanPolicySnapshot {
  policy: ScanPolicy;
  rawContent: string;
}

export function resolveScanConfigPath(input?: string): string {
  if (!input) {
    return paths.jobSearchConfig;
  }
  return isAbsolute(input) ? input : resolve(process.cwd(), input);
}

export function parseProfileOverride(input?: string): RoleProfile | undefined {
  if (!input) {
    return undefined;
  }
  return parseRoleProfile(input);
}

export function loadJobSearchConfigAt(configPath: string): JobSearchConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Missing job search config: ${configPath}`);
  }
  return JobSearchConfigSchema.parse(
    JSON.parse(readFileSync(configPath, "utf8")),
  );
}

function configLabelForPath(configPath: string): string {
  if (configPath.endsWith("job-search-nodejs-backend.json")) {
    return "config/job-search-nodejs-backend.json";
  }
  if (configPath.endsWith("job-search.json")) {
    return "config/job-search.json";
  }
  const relativePath = relative(process.cwd(), configPath);
  if (relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath)) {
    return relativePath.replaceAll("\\", "/");
  }
  return basename(configPath);
}

export function compileScanPolicy(
  config: JobSearchConfig,
  options: {
    configPath: string;
    profileOverride?: RoleProfile;
  },
): ScanPolicy {
  const roleProfile = resolveRoleProfileFromConfig(
    config.roleFilters,
    options.profileOverride,
  );

  return {
    configPath: options.configPath,
    configLabel: configLabelForPath(options.configPath),
    roleProfile,
    allowedLevels: config.roleFilters.levels,
    geo: {
      acceptGlobalRemote: config.geoEligibility.acceptGlobalRemote,
      acceptEmeaOnlyWhenAfricaMentioned:
        config.geoEligibility.acceptEmeaOnlyWhenAfricaMentioned,
      defaultEmeaToVerify: config.geoEligibility.defaultEmeaToVerify,
      summary: config.geoEligibility.summary,
    },
    applicant: {
      location: config.applicant.location,
      citizenship: config.applicant.citizenship,
      workPermitCountries: config.applicant.workPermitCountries,
      name: config.applicant.name,
    },
    blocklist: config.blocklist,
  };
}

export function loadAndCompileScanPolicy(options: {
  configPath?: string;
  profileOverride?: RoleProfile;
} = {}): ScanPolicy {
  return loadAndCompileScanPolicySnapshot(options).policy;
}

export function loadAndCompileScanPolicySnapshot(options: {
  configPath?: string;
  profileOverride?: RoleProfile;
} = {}): ScanPolicySnapshot {
  const configPath = resolveScanConfigPath(options.configPath);
  if (!existsSync(configPath)) {
    throw new Error(`Missing job search config: ${configPath}`);
  }
  const rawContent = readFileSync(configPath, "utf8");
  const config = JobSearchConfigSchema.parse(JSON.parse(rawContent));
  return {
    policy: compileScanPolicy(config, {
      configPath,
      profileOverride: options.profileOverride,
    }),
    rawContent,
  };
}

export function serializeScanPolicy(policy: ScanPolicy): SerializedScanPolicy {
  return {
    configLabel: policy.configLabel,
    roleProfile: policy.roleProfile,
    roleProfileLabel: roleProfileLabel(policy.roleProfile),
    allowedLevels: policy.allowedLevels,
    geo: policy.geo,
    applicant: policy.applicant,
    blocklistCount: policy.blocklist.length,
  };
}

export function levelExclusionReason(level: LevelHint): string {
  switch (level) {
    case "senior":
      return "Level not allowed: senior";
    case "staff_lead":
      return "Level not allowed: staff/lead";
    case "junior":
      return "Level not allowed: junior";
    case "mid":
      return "Level not allowed: mid";
    default:
      return "Level not allowed: unknown";
  }
}

export function loadBlocklistAt(configPath?: string): string[] {
  const resolved = resolveScanConfigPath(configPath);
  return loadJobSearchConfigAt(resolved).blocklist;
}

export function isAllowedLevel(
  level: LevelHint,
  policy: Pick<ScanPolicy, "allowedLevels">,
): boolean {
  return policy.allowedLevels.includes(level);
}
