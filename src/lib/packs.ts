import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { paths } from "./paths.js";

const PackCursorSchema = z.object({
  skills: z.array(z.string()).default([]),
  commands: z.array(z.string()).default([]),
  rules: z.array(z.string()).default([]),
});

const PackDefSchema = z.object({
  label: z.string(),
  description: z.string(),
  default: z.boolean().default(false),
  required: z.boolean().default(false),
  recommended: z.boolean().default(false),
  dependsOn: z.array(z.string()).default([]),
  cursor: PackCursorSchema.default({
    skills: [],
    commands: [],
    rules: [],
  }),
  sources: z.array(z.string()).default([]),
  scripts: z.array(z.string()).default([]),
});

const PacksManifestSchema = z.object({
  version: z.number(),
  packs: z.record(z.string(), PackDefSchema),
});

export const RefineCvStateSchema = z.object({
  version: z.number().default(1),
  installedPacks: z.array(z.string()),
  setupCompletedAt: z.string().optional(),
  cvIntakeCompleted: z.boolean().default(false),
  githubConnectCompleted: z.boolean().default(false),
});

export type PacksManifest = z.infer<typeof PacksManifestSchema>;
export type PackDef = z.infer<typeof PackDefSchema>;
export type RefineCvState = z.infer<typeof RefineCvStateSchema>;

export function loadPacksManifest(): PacksManifest {
  if (!existsSync(paths.packsManifest)) {
    throw new Error(`Missing packs manifest: ${paths.packsManifest}`);
  }
  const raw = JSON.parse(readFileSync(paths.packsManifest, "utf8")) as unknown;
  return PacksManifestSchema.parse(raw);
}

export function loadRefineCvState(): RefineCvState | null {
  if (!existsSync(paths.refineCvConfig)) return null;
  const raw = JSON.parse(readFileSync(paths.refineCvConfig, "utf8")) as unknown;
  return RefineCvStateSchema.parse(raw);
}

export function saveRefineCvState(state: RefineCvState): void {
  mkdirSync(join(paths.root, "config"), { recursive: true });
  writeFileSync(paths.refineCvConfig, `${JSON.stringify(state, null, 2)}\n`);
}

export function getDefaultPackIds(manifest: PacksManifest): string[] {
  return Object.entries(manifest.packs)
    .filter(([, pack]) => pack.default || pack.required)
    .map(([id]) => id);
}

export function getRecommendedPackIds(manifest: PacksManifest): string[] {
  return Object.entries(manifest.packs)
    .filter(([, pack]) => pack.recommended)
    .map(([id]) => id);
}

export function resolvePackDependencies(
  manifest: PacksManifest,
  packIds: string[],
): string[] {
  const resolved = new Set<string>();
  const visit = (id: string) => {
    const pack = manifest.packs[id];
    if (!pack) {
      throw new Error(`Unknown pack: ${id}`);
    }
    for (const dep of pack.dependsOn) visit(dep);
    resolved.add(id);
  };
  for (const id of packIds) visit(id);
  for (const [id, pack] of Object.entries(manifest.packs)) {
    if (pack.required) resolved.add(id);
  }
  return [...resolved];
}

export function isPackInstalled(packId: string, state?: RefineCvState | null): boolean {
  const current = state ?? loadRefineCvState();
  if (!current) return packId === "core";
  return current.installedPacks.includes(packId);
}

/**
 * Sync .cursor/ from packs/. Non-destructive for user-created assets:
 * only files owned by a pack (listed in packs.json) are removed/overwritten,
 * so skills/commands/rules the user added directly to .cursor/ survive.
 */
export function syncCursorAssets(installedPacks: string[]): void {
  const manifest = loadPacksManifest();
  const resolved = resolvePackDependencies(manifest, installedPacks);
  const cursorRoot = join(paths.root, ".cursor");

  for (const pack of Object.values(manifest.packs)) {
    for (const skill of pack.cursor.skills) {
      rmSync(join(cursorRoot, "skills", skill), { recursive: true, force: true });
    }
    for (const command of pack.cursor.commands) {
      rmSync(join(cursorRoot, "commands", `${command}.md`), { force: true });
    }
    for (const rule of pack.cursor.rules) {
      rmSync(join(cursorRoot, "rules", `${rule}.mdc`), { force: true });
    }
  }

  for (const sub of ["skills", "commands", "rules"] as const) {
    mkdirSync(join(cursorRoot, sub), { recursive: true });
  }

  for (const packId of resolved) {
    const packCursorDir = join(paths.root, "packs", packId, "cursor");
    if (!existsSync(packCursorDir)) continue;
    for (const sub of ["skills", "commands", "rules"] as const) {
      const src = join(packCursorDir, sub);
      if (!existsSync(src)) continue;
      cpSync(src, join(cursorRoot, sub), { recursive: true });
    }
  }
}

export function installPacks(
  packIds: string[],
  partial?: Partial<RefineCvState>,
): RefineCvState {
  const manifest = loadPacksManifest();
  const resolved = resolvePackDependencies(manifest, packIds);
  syncCursorAssets(resolved);
  const existing = loadRefineCvState();
  const state: RefineCvState = {
    version: 1,
    installedPacks: resolved,
    setupCompletedAt: existing?.setupCompletedAt,
    cvIntakeCompleted: existing?.cvIntakeCompleted ?? false,
    githubConnectCompleted: existing?.githubConnectCompleted ?? false,
    ...partial,
  };
  saveRefineCvState(state);
  return state;
}

export function addPack(packId: string): RefineCvState {
  const manifest = loadPacksManifest();
  if (!manifest.packs[packId]) {
    throw new Error(`Unknown pack: ${packId}`);
  }
  const existing = loadRefineCvState();
  const current = existing?.installedPacks ?? getDefaultPackIds(manifest);
  const next = current.includes(packId) ? current : [...current, packId];
  return installPacks(next, {
    setupCompletedAt: existing?.setupCompletedAt,
    cvIntakeCompleted: existing?.cvIntakeCompleted,
    githubConnectCompleted: existing?.githubConnectCompleted,
  });
}

export function removePack(packId: string): RefineCvState {
  const manifest = loadPacksManifest();
  const pack = manifest.packs[packId];
  if (!pack) throw new Error(`Unknown pack: ${packId}`);
  if (pack.required) {
    throw new Error(`Cannot remove required pack: ${packId}`);
  }
  const existing = loadRefineCvState();
  const current = existing?.installedPacks ?? getDefaultPackIds(manifest);
  const next = current.filter((id) => id !== packId);
  return installPacks(next, {
    setupCompletedAt: existing?.setupCompletedAt,
    cvIntakeCompleted: existing?.cvIntakeCompleted,
    githubConnectCompleted: existing?.githubConnectCompleted,
  });
}

/** Seed profile/questionnaire.md from the example template if missing. */
export function seedQuestionnaire(): boolean {
  if (existsSync(paths.questionnaire)) return false;
  if (!existsSync(paths.questionnaireExample)) return false;
  mkdirSync(paths.profile, { recursive: true });
  copyFileSync(paths.questionnaireExample, paths.questionnaire);
  return true;
}

/** True when the questionnaire is still an untouched copy of the example. */
export function isQuestionnaireUntouched(): boolean {
  if (!existsSync(paths.questionnaire) || !existsSync(paths.questionnaireExample)) {
    return false;
  }
  return (
    readFileSync(paths.questionnaire, "utf8") ===
    readFileSync(paths.questionnaireExample, "utf8")
  );
}

/** Exact filenames expected by pnpm extract-toptal-guides. */
export const TOPTAL_GUIDE_PDFS = [
  "Job Application Matching Process Handbook for Developers.pdf",
  "Developer - Profile Creation Guide.pdf",
] as const;

export function hasToptalGuidePdfs(): boolean {
  const pdfDir = join(paths.root, "sources", "toptal-guides", "pdf");
  if (!existsSync(pdfDir)) return false;
  return TOPTAL_GUIDE_PDFS.every((name) => existsSync(join(pdfDir, name)));
}

export function hasToptalGuideExtracts(): boolean {
  return existsSync(paths.toptalMatchingHandbook) && existsSync(paths.toptalProfileGuide);
}
