import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { paths, ROOT, cursorSkill } from "./paths.js";
import { loadGitHubConfig } from "./config.js";
import { isBaseCvExtracted } from "./pdf/extract-cv.js";
import {
  isQuestionnaireUntouched,
  loadPacksManifest,
  loadRefineCvState,
  resolvePackDependencies,
  type PacksManifest,
} from "./packs.js";
import { loadJobSourcesConfig } from "./jobs/sources/registry.js";
import { loadJobSearchConfigAt } from "./jobs/scan-policy.js";
import { LINKEDIN_PROFILE_DIR } from "./jobs/state.js";

type Status = "ok" | "warn" | "fail";
type Counts = { ok: number; warn: number; fail: number };

function check(status: Status, msg: string, counts: Counts) {
  const label = status === "ok" ? "OK  " : status === "warn" ? "WARN" : "FAIL";
  console.log(`${label} ${msg}`);
  counts[status] += 1;
}

/**
 * Manifest-driven check of every installed pack's Cursor assets and source
 * files, so packs.json stays the single source of truth.
 */
function checkPackAssets(
  manifest: PacksManifest,
  installedPacks: string[],
  counts: Counts,
): void {
  for (const packId of installedPacks) {
    const pack = manifest.packs[packId];
    if (!pack) {
      check("warn", `unknown pack "${packId}" in config/refine-cv.json — not in packs.json`, counts);
      continue;
    }

    for (const skill of pack.cursor.skills) {
      if (existsSync(cursorSkill(skill))) check("ok", `[${packId}] skill: ${skill}`, counts);
      else check("fail", `[${packId}] missing skill "${skill}" — run pnpm setup`, counts);
    }
    for (const command of pack.cursor.commands) {
      const file = join(ROOT, ".cursor", "commands", `${command}.md`);
      if (existsSync(file)) check("ok", `[${packId}] command: /${command}`, counts);
      else check("fail", `[${packId}] missing command "/${command}" — run pnpm setup`, counts);
    }
    for (const rule of pack.cursor.rules) {
      const file = join(ROOT, ".cursor", "rules", `${rule}.mdc`);
      if (existsSync(file)) check("ok", `[${packId}] rule: ${rule}`, counts);
      else check("fail", `[${packId}] missing rule "${rule}" — run pnpm setup`, counts);
    }
    for (const source of pack.sources) {
      if (existsSync(join(ROOT, source))) check("ok", `[${packId}] source: ${source}`, counts);
      else {
        const status: Status = packId === "core" ? "fail" : "warn";
        check(status, `[${packId}] missing source: ${source}`, counts);
      }
    }
  }
}

export function runValidateSetup(): number {
  const counts: Counts = { ok: 0, warn: 0, fail: 0 };
  const state = loadRefineCvState();

  let manifest: PacksManifest;
  try {
    manifest = loadPacksManifest();
    check("ok", "packs.json manifest", counts);
  } catch (err) {
    check("fail", `packs.json: ${err instanceof Error ? err.message : err}`, counts);
    console.log(`\nSummary: ${counts.ok} ok, ${counts.warn} warn, ${counts.fail} fail`);
    return 1;
  }

  let installed: string[];
  if (state) {
    installed = resolvePackDependencies(manifest, state.installedPacks);
    check("ok", `installed packs: ${installed.join(", ")}`, counts);
  } else {
    installed = ["core"];
    check("warn", "config/refine-cv.json missing — run pnpm setup (checking core only)", counts);
  }

  checkPackAssets(manifest, installed, counts);

  // --- core: CV intake and onboarding artifacts ---

  if (existsSync(paths.baseCvPdf)) check("ok", "profile/base-cv.pdf", counts);
  else check("warn", "profile/base-cv.pdf not found (fine if you pasted CV text)", counts);

  if (isBaseCvExtracted()) {
    check("ok", "profile/base-cv.md extracted", counts);
  } else if (existsSync(paths.baseCvMd)) {
    check("ok", "profile/base-cv.md present (manually created — no extraction marker)", counts);
  } else {
    check("warn", "profile/base-cv.md missing — run pnpm setup or pnpm extract-cv", counts);
  }

  if (!existsSync(paths.questionnaire)) {
    check("warn", "profile/questionnaire.md missing — run pnpm setup, then fill via /onboard", counts);
  } else if (isQuestionnaireUntouched()) {
    check("warn", "profile/questionnaire.md not filled in yet — run /onboard", counts);
  } else {
    check("ok", "profile/questionnaire.md", counts);
  }

  if (existsSync(paths.baseCvEnhanced)) {
    const e = readFileSync(paths.baseCvEnhanced, "utf8");
    if (e.includes("Pending onboarding")) {
      check("warn", "onboarding not complete — run /onboard in Cursor chat", counts);
    } else {
      check("ok", "base-cv-enhanced.md ready", counts);
    }
  } else {
    check("warn", "base-cv-enhanced.md missing — run /onboard", counts);
  }

  // --- tailor-cv extras ---

  if (installed.includes("tailor-cv")) {
    let chromeInstalled = false;
    try {
      const out = execSync("pnpm exec puppeteer browsers list", {
        stdio: "pipe",
        cwd: ROOT,
        encoding: "utf8",
      });
      chromeInstalled = out.includes("chrome@");
    } catch {
      chromeInstalled = false;
    }
    if (chromeInstalled) check("ok", "Chrome available for PDF rendering", counts);
    else check("warn", "Chrome not installed for PDF rendering — run pnpm setup:pdf", counts);
  }

  // --- github-evidence extras ---

  if (installed.includes("github-evidence")) {
    try {
      const cfg = loadGitHubConfig();
      if (cfg.repos.length > 0) {
        check("ok", `config/github-repos.json has ${cfg.repos.length} repo(s)`, counts);
      } else {
        check("warn", "no repos in config — run pnpm setup or pnpm list-repos", counts);
      }
      if (cfg.githubUsername) {
        check("ok", `githubUsername: ${cfg.githubUsername}`, counts);
      }
    } catch {
      check("fail", "invalid or missing config/github-repos.json", counts);
    }

    let hasToken = Boolean(process.env.GITHUB_TOKEN?.trim());
    if (!hasToken) {
      try {
        execSync("gh auth token", { stdio: "pipe" });
        hasToken = true;
      } catch {
        hasToken = false;
      }
    }

    if (hasToken) check("ok", "GitHub token available (GITHUB_TOKEN or gh)", counts);
    else check("warn", "no GitHub token — set GITHUB_TOKEN or run gh auth login", counts);

    if (existsSync(paths.githubIndex)) {
      try {
        const idx = JSON.parse(readFileSync(paths.githubIndex, "utf8")) as {
          generatedAt?: string | null;
        };
        if (idx.generatedAt) check("ok", "GitHub index generated", counts);
        else check("warn", "GitHub index empty — pnpm index-github", counts);
      } catch {
        check("warn", "invalid github-index.json", counts);
      }
    } else {
      check("warn", "GitHub index not run — pnpm index-github", counts);
    }
  }

  // --- toptal extras (generated extracts are not manifest sources) ---

  if (installed.includes("toptal")) {
    if (existsSync(paths.toptalMatchingHandbook) && existsSync(paths.toptalProfileGuide)) {
      check("ok", "Toptal guide extracts (full mode)", counts);
    } else {
      check(
        "warn",
        "Toptal guide extracts missing (degraded mode) — add PDFs to sources/toptal-guides/pdf/ and run pnpm extract-toptal-guides",
        counts,
      );
    }

    if (existsSync(paths.toptalProfileCurrent))
      check("ok", "profile/toptal-profile-current.md", counts);
    else check("warn", "no Toptal profile snapshot — paste via /enhance-toptal-profile", counts);
  }

  if (installed.includes("job-scan")) {
    try {
      const sources = loadJobSourcesConfig();
      const enabled = sources.sources.filter((source) => source.enabled).length;
      check("ok", `config/job-sources.json valid (${enabled} enabled board(s))`, counts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      check("fail", `config/job-sources.json invalid or missing — ${message}`, counts);
    }

    try {
      loadJobSearchConfigAt(paths.jobSearchConfig);
      check("ok", "config/job-search.json valid", counts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      check("fail", `config/job-search.json invalid or missing — ${message}`, counts);
    }

    if (existsSync(paths.jobSearchNodejsBackendConfig)) {
      try {
        loadJobSearchConfigAt(paths.jobSearchNodejsBackendConfig);
        check("ok", "config/job-search-nodejs-backend.json valid", counts);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        check("warn", `config/job-search-nodejs-backend.json invalid — ${message}`, counts);
      }
    } else {
      check("warn", "config/job-search-nodejs-backend.json missing (optional backend profile)", counts);
    }

    if (existsSync(LINKEDIN_PROFILE_DIR)) {
      check("ok", "LinkedIn session profile present (optional discovery)", counts);
    } else {
      check(
        "warn",
        "no LinkedIn session — optional; run pnpm linkedin:login for discovery",
        counts,
      );
    }
  }

  console.log(`\nSummary: ${counts.ok} ok, ${counts.warn} warn, ${counts.fail} fail`);
  return counts.fail > 0 ? 1 : 0;
}
