export type RoleProfile = "reactFrontend" | "nodejsBackend";

export function parseRoleProfile(input: string): RoleProfile {
  if (input === "reactFrontend" || input === "nodejsBackend") {
    return input;
  }

  throw new Error(
    `Invalid role profile "${input}". Use reactFrontend or nodejsBackend.`,
  );
}

export interface RoleFiltersConfig {
  reactFrontend?: boolean;
  profile?: RoleProfile;
  levels: string[];
}

export function resolveRoleProfileFromConfig(
  roleFilters: RoleFiltersConfig,
  override?: RoleProfile,
): RoleProfile {
  if (override) {
    return override;
  }
  if (roleFilters.profile) {
    return roleFilters.profile;
  }
  if (roleFilters.reactFrontend === false) {
    return "nodejsBackend";
  }
  return "reactFrontend";
}

export function roleProfileLabel(profile: RoleProfile): string {
  return profile === "nodejsBackend" ? "Node.js / backend" : "React / frontend";
}
