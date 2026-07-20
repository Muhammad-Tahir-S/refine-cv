import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { atomicWriteJson, loadPersistedState } from "./persistence.js";
import type { RoleProfile } from "./role-profile.js";
import { REFINE_CV_CONFIG_DIR } from "./state.js";

export const SOURCE_POLL_STATE_PATH = `${REFINE_CV_CONFIG_DIR}/source-poll-state.json`;

const SourcePollErrorSchema = z.object({
  message: z.string(),
  status: z.number().optional(),
  attempts: z.number().optional(),
});

const TimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Expected a valid timestamp",
);

const SourcePollEntrySchema = z.object({
  lastAttemptAt: TimestampSchema.optional(),
  lastSuccessAt: TimestampSchema.optional(),
  lastFailureAt: TimestampSchema.optional(),
  lastError: SourcePollErrorSchema.optional(),
});

const SourcePollStateV1Schema = z.object({
  version: z.literal(1),
  sources: z.record(z.string(), SourcePollEntrySchema),
});

const SourcePollStateV2Schema = z.object({
  version: z.literal(2),
  profiles: z.object({
    reactFrontend: z.record(z.string(), SourcePollEntrySchema),
    nodejsBackend: z.record(z.string(), SourcePollEntrySchema),
  }),
});

export type SourcePollEntry = z.infer<typeof SourcePollEntrySchema>;
export type SourcePollState = z.infer<typeof SourcePollStateV2Schema>;

export type SourcePollOutcome = "success" | "failure";

export interface SourcePollUpdate {
  sourceId: string;
  outcome: SourcePollOutcome;
  attemptedAt: string;
  completedAt: string;
  error?: {
    message: string;
    status?: number;
    attempts?: number;
  };
}

function emptySourcePollState(): SourcePollState {
  return {
    version: 2,
    profiles: { reactFrontend: {}, nodejsBackend: {} },
  };
}

export function migrateSourcePollState(raw: unknown): SourcePollState {
  const version = (raw as { version?: unknown } | null)?.version;
  if (version === 2) {
    return SourcePollStateV2Schema.parse(raw);
  }
  if (version === 1) {
    const v1 = SourcePollStateV1Schema.parse(raw);
    return {
      version: 2,
      profiles: {
        // Flat Phase 5 state predated profile isolation and represented the
        // default React scan, so migrate it there deterministically.
        reactFrontend: { ...v1.sources },
        nodejsBackend: {},
      },
    };
  }
  throw new Error(
    `Unsupported source poll state version: ${String(version ?? "missing")}. Expected 1 or 2.`,
  );
}

export function loadSourcePollState(
  statePath: string = SOURCE_POLL_STATE_PATH,
): SourcePollState {
  return loadPersistedState(statePath, migrateSourcePollState, emptySourcePollState);
}

export function saveSourcePollState(
  state: SourcePollState,
  statePath: string = SOURCE_POLL_STATE_PATH,
): void {
  mkdirSync(dirname(statePath), { recursive: true });
  atomicWriteJson(statePath, state, { backup: true });
}

/**
 * Cadence anchors on the latest attempt or completion timestamp. Completion
 * normally wins, so retries and slow responses cannot shorten minPollHours.
 */
export function resolveCadenceAnchor(entry: SourcePollEntry | undefined): string | undefined {
  if (!entry) {
    return undefined;
  }
  const timestamps = [
    entry.lastAttemptAt,
    entry.lastSuccessAt,
    entry.lastFailureAt,
  ].filter(
    (value): value is string =>
      typeof value === "string" && Number.isFinite(Date.parse(value)),
  );
  if (timestamps.length === 0) {
    return undefined;
  }

  return timestamps.reduce((latest, current) =>
    Date.parse(current) > Date.parse(latest) ? current : latest,
  );
}

export function shouldSkipSourcePoll(
  entry: SourcePollEntry | undefined,
  minPollHours: number,
  now: Date,
  force: boolean,
): { skip: boolean; reason?: string; nextEligibleAt?: string } {
  if (force || minPollHours <= 0) {
    return { skip: false };
  }

  const anchor = resolveCadenceAnchor(entry);
  if (!anchor) {
    return { skip: false };
  }

  const elapsedMs = now.getTime() - Date.parse(anchor);
  const minIntervalMs = minPollHours * 60 * 60 * 1000;
  if (elapsedMs >= minIntervalMs) {
    return { skip: false };
  }

  const remainingMs = minIntervalMs - elapsedMs;
  const nextEligibleAt = new Date(now.getTime() + remainingMs).toISOString();
  const hoursRemaining = Math.ceil(remainingMs / (60 * 60 * 1000));
  return {
    skip: true,
    reason: `minPollHours=${minPollHours}; next eligible ~${hoursRemaining}h (${nextEligibleAt})`,
    nextEligibleAt,
  };
}

export function applySourcePollUpdates(
  state: SourcePollState,
  profile: RoleProfile,
  updates: SourcePollUpdate[],
): SourcePollState {
  if (updates.length === 0) {
    return state;
  }

  const sources = { ...state.profiles[profile] };
  for (const update of updates) {
    const existing = sources[update.sourceId] ?? {};
    const next: SourcePollEntry = {
      ...existing,
      lastAttemptAt: update.attemptedAt,
    };

    if (update.outcome === "success") {
      next.lastSuccessAt = update.completedAt;
      next.lastError = undefined;
    } else {
      next.lastFailureAt = update.completedAt;
      next.lastError = update.error;
    }

    sources[update.sourceId] = next;
  }

  return {
    version: 2,
    profiles: {
      ...state.profiles,
      [profile]: sources,
    },
  };
}
