#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { Command } from "commander";
import { checkbox, confirm, editor, input, select } from "@inquirer/prompts";
import { getGitHubToken } from "../lib/auth.js";
import { loadGitHubConfig, type GitHubReposConfig } from "../lib/config.js";
import { runListRepos } from "../lib/github/list-candidates.js";
import { isBaseCvExtracted, runExtractCv, writeBaseCvFromText } from "../lib/pdf/extract-cv.js";
import { runExtractToptalGuides } from "../lib/toptal/extract-guides.js";
import {
  addPack,
  getDefaultPackIds,
  getRecommendedPackIds,
  hasToptalGuideExtracts,
  hasToptalGuidePdfs,
  installPacks,
  loadPacksManifest,
  loadRefineCvState,
  removePack,
  saveRefineCvState,
  seedQuestionnaire,
  TOPTAL_GUIDE_PDFS,
  type RefineCvState,
} from "../lib/packs.js";
import { paths } from "../lib/paths.js";
import { runValidateSetup } from "../lib/validate-setup.js";

const program = new Command();

program
  .name("setup")
  .description("Interactive setup wizard for refine-cv")
  .option("--add <pack>", "Add a feature pack and sync .cursor/")
  .option("--remove <pack>", "Remove a feature pack and sync .cursor/")
  .option("--yes", "Accept recommended defaults without prompts")
  .action(async (opts: { add?: string; remove?: string; yes?: boolean }) => {
    if (opts.add) {
      addPack(opts.add);
      console.log(`Added pack "${opts.add}" and synced .cursor/`);
      if (opts.add === "tailor-cv") installChromeForPdf(true);
      maybeWarnToptalDegraded(opts.add);
      return;
    }
    if (opts.remove) {
      removePack(opts.remove);
      console.log(`Removed pack "${opts.remove}" and synced .cursor/`);
      return;
    }
    await runSetupWizard(Boolean(opts.yes));
  });

async function runSetupWizard(yes: boolean): Promise<void> {
  console.log("\nrefine-cv setup\n");

  const manifest = loadPacksManifest();
  const existing = loadRefineCvState();
  const recommended = getRecommendedPackIds(manifest);
  const defaultSelected = existing?.installedPacks ?? [
    ...new Set([...getDefaultPackIds(manifest), ...recommended]),
  ];

  let selectedPacks = defaultSelected;
  if (!yes) {
    selectedPacks = await checkbox({
      message: "Select feature packs to install",
      choices: Object.entries(manifest.packs).map(([id, pack]) => ({
        name: `${pack.label} — ${pack.description}${pack.required ? " (required)" : ""}`,
        value: id,
        checked: defaultSelected.includes(id),
        disabled: pack.required ? "(always installed)" : false,
      })),
    });
  }

  let state = installPacks(selectedPacks);
  console.log(`\nInstalled packs: ${state.installedPacks.join(", ")}`);
  console.log("Synced .cursor/ skills, commands, and rules.");

  if (seedQuestionnaire()) {
    console.log("Created profile/questionnaire.md from the template (filled during /onboard).");
  }
  console.log("");

  if (state.installedPacks.includes("tailor-cv")) {
    await setupPdfRenderer(yes);
  }

  if (state.installedPacks.includes("toptal")) {
    await setupToptalGuides(yes);
  }

  state = await setupCvIntake(state, yes);
  saveRefineCvState(state);

  if (state.installedPacks.includes("github-evidence")) {
    state = await setupGitHubConnect(state, yes);
    saveRefineCvState(state);
  }

  state = {
    ...state,
    setupCompletedAt: new Date().toISOString(),
  };
  saveRefineCvState(state);

  printHandoff(state);
  console.log(
    "\nRunning validation... (warnings about /onboard outputs are expected until you complete agent onboarding)\n",
  );
  runValidateSetup();
}

/**
 * Puppeteer needs a local Chrome for PDF rendering (tailor-cv pack only).
 * Idempotent: skips the download when Chrome is already in the cache.
 */
function installChromeForPdf(quiet = false): void {
  try {
    if (!quiet) console.log("Ensuring Chrome is available for PDF rendering (skips if cached)...");
    execSync("pnpm exec puppeteer browsers install chrome", {
      stdio: quiet ? "pipe" : "inherit",
      cwd: paths.root,
    });
  } catch {
    console.warn(
      "WARN: could not install Chrome for PDF rendering. Run `pnpm setup:pdf` before using `pnpm render-cv`.",
    );
  }
}

async function setupPdfRenderer(yes: boolean): Promise<void> {
  const install =
    yes ||
    (await confirm({
      message:
        "tailor-cv renders PDFs with a local Chrome (~170 MB download, skipped if already installed). Install now?",
      default: true,
    }));
  if (install) {
    installChromeForPdf();
  } else {
    console.log("Skipped. Run `pnpm setup:pdf` before your first `pnpm render-cv`.");
  }
}

async function setupToptalGuides(yes: boolean): Promise<void> {
  if (hasToptalGuideExtracts()) {
    console.log("Toptal guide extracts found.");
    return;
  }
  if (hasToptalGuidePdfs()) {
    const runExtract = yes || (await confirm({
      message: "Toptal PDFs found. Run pnpm extract-toptal-guides now?",
      default: true,
    }));
    if (runExtract) {
      await runExtractToptalGuides();
      if (!hasToptalGuideExtracts()) {
        console.warn("Toptal extract did not produce structured guide files — check PDF paths.");
      }
    }
    return;
  }
  console.warn(
    "\nWARN: Toptal pack installed but the guide PDFs are missing (degraded mode).\n" +
      "Drop these files into sources/toptal-guides/pdf/ (exact names):\n" +
      TOPTAL_GUIDE_PDFS.map((name) => `  - ${name}`).join("\n") +
      "\nThen run: pnpm extract-toptal-guides\n" +
      "Until then, Toptal skills fall back to sources/toptal-best-practices.md.\n",
  );
}

async function setupCvIntake(state: RefineCvState, yes: boolean): Promise<RefineCvState> {
  if (isBaseCvExtracted()) {
    if (!state.cvIntakeCompleted) return { ...state, cvIntakeCompleted: true };
    console.log("CV intake already complete.");
    return state;
  }

  console.log("\n--- CV intake ---\n");

  if (yes) {
    if (existsSync(paths.baseCvPdf)) {
      await runExtractCv();
      return { ...state, cvIntakeCompleted: true };
    }
    console.log("Skipped CV intake (no profile/base-cv.pdf). Add it and run pnpm extract-cv.");
    return state;
  }

  const method = await select({
    message: "How do you want to provide your master CV?",
    choices: [
      { name: "Path to a PDF file", value: "pdf" },
      { name: "Paste the text (opens your editor)", value: "paste" },
      { name: "Skip for now", value: "skip" },
    ],
  });

  if (method === "skip") {
    console.log(
      "Skipped CV intake. Later: add profile/base-cv.pdf and run pnpm extract-cv, or re-run pnpm setup.",
    );
    return state;
  }

  if (method === "paste") {
    const text = await editor({
      message: "Paste your CV text, then save and close the editor",
      waitForUserInput: false,
    });
    if (!text.trim()) {
      console.warn("Empty CV text — skipping intake.");
      return state;
    }
    writeBaseCvFromText(text);
    return confirmCvExtraction(state, yes);
  }

  const pdfPath = await input({
    message: "Path to your master CV PDF",
    default: existsSync(paths.baseCvPdf) ? paths.baseCvPdf : "",
  });

  if (!pdfPath.trim()) {
    console.log("Skipped CV intake. Add profile/base-cv.pdf and run pnpm extract-cv later.");
    return state;
  }

  const resolved = resolve(pdfPath.trim());
  if (!existsSync(resolved)) {
    console.warn(`File not found: ${resolved}`);
    return state;
  }

  mkdirSync(paths.profile, { recursive: true });
  if (resolved !== paths.baseCvPdf) {
    copyFileSync(resolved, paths.baseCvPdf);
    console.log(`Copied to ${paths.baseCvPdf}`);
  }

  await runExtractCv();
  return confirmCvExtraction(state, yes);
}

async function confirmCvExtraction(state: RefineCvState, yes: boolean): Promise<RefineCvState> {
  const preview = readFileSync(paths.baseCvMd, "utf8").slice(0, 600);
  console.log(`\nExtract preview (${basename(paths.baseCvMd)}):\n${preview}\n...\n`);

  const ok = yes || (await confirm({ message: "Does the extraction look correct?", default: true }));
  if (!ok) {
    console.log("You can edit profile/base-cv.md manually or re-run setup.");
    return state;
  }
  return { ...state, cvIntakeCompleted: true };
}

async function setupGitHubConnect(state: RefineCvState, yes: boolean): Promise<RefineCvState> {
  ensureGitHubConfigFile();

  if (state.githubConnectCompleted) {
    try {
      const cfg = loadGitHubConfig();
      if (cfg.repos.length > 0) {
        console.log(`GitHub connect already complete (${cfg.repos.length} repos).`);
        return state;
      }
    } catch {
      // continue setup
    }
  }

  console.log("\n--- GitHub connect ---\n");

  let hasAuth = hasGitHubAuth();
  if (hasAuth) console.log("GitHub token available.");

  if (!hasAuth && !yes) {
    const method = await select({
      message: "GitHub authentication method",
      choices: [
        { name: "Run gh auth login now (recommended)", value: "gh" },
        { name: "I will set GITHUB_TOKEN in .env", value: "env" },
        { name: "Skip GitHub setup for now", value: "skip" },
      ],
    });
    if (method === "gh") {
      try {
        execSync("gh auth login", { stdio: "inherit", cwd: paths.root });
      } catch {
        console.warn(
          "gh auth login failed or gh is not installed (https://cli.github.com/). " +
            "Set GITHUB_TOKEN in .env instead, then re-run pnpm setup.",
        );
        return state;
      }
      hasAuth = hasGitHubAuth();
      if (!hasAuth) {
        console.warn("Still no GitHub token after gh auth login — skipping GitHub setup.");
        return state;
      }
    }
    if (method === "env") {
      console.log("\nCreate .env with GITHUB_TOKEN=ghp_... then re-run: pnpm setup\n");
      return state;
    }
    if (method === "skip") {
      return state;
    }
  }

  if (!hasAuth) {
    console.log("Skipping GitHub setup — no token available.");
    return state;
  }

  let cfg: GitHubReposConfig;
  try {
    cfg = loadGitHubConfig();
  } catch {
    ensureGitHubConfigFile();
    cfg = loadGitHubConfig();
  }

  let username = cfg.githubUsername ?? process.env.GITHUB_USERNAME ?? "";
  if (!username && !yes) {
    username = await input({ message: "GitHub username" });
  }
  if (!username) {
    console.warn("GitHub username required. Set githubUsername in config/github-repos.json.");
    return state;
  }

  const candidates = await runListRepos({ username, years: 10 });
  if (candidates.length === 0) {
    console.warn("No repos found.");
    return state;
  }

  const existing = new Set(cfg.repos);
  const defaultChecked = candidates
    .filter((r) => existing.has(r.nameWithOwner))
    .map((r) => r.nameWithOwner);

  let selected: string[];
  if (yes) {
    if (defaultChecked.length === 0) {
      console.log(
        "Non-interactive mode: no repos preselected in config/github-repos.json — skipping repo selection. " +
          "Run pnpm setup (interactive) or edit the config, then pnpm index-github.",
      );
      return state;
    }
    selected = defaultChecked;
  } else {
    selected = await checkbox({
      message: "Select repos to index",
      choices: candidates.map((r) => ({
        name: `${r.nameWithOwner} (${r.pushedAt.slice(0, 10)}, ${r.isPrivate ? "private" : "public"})`,
        value: r.nameWithOwner,
        checked: defaultChecked.includes(r.nameWithOwner),
      })),
      pageSize: 15,
    });
  }

  const { _comment: _ignored, ...cfgWithoutComment } = cfg;
  const nextConfig: GitHubReposConfig = {
    ...cfgWithoutComment,
    githubUsername: username,
    repos: selected,
  };
  writeFileSync(paths.config, `${JSON.stringify(nextConfig, null, 2)}\n`);
  console.log(`\nWrote ${selected.length} repo(s) to config/github-repos.json`);

  const nextState = { ...state, githubConnectCompleted: selected.length > 0 };
  saveRefineCvState(nextState);

  const runIndex = yes || (await confirm({
    message: "Run pnpm index-github now?",
    default: true,
  }));
  if (runIndex) {
    try {
      execSync("pnpm index-github", { stdio: "inherit", cwd: paths.root });
    } catch {
      console.warn(
        "WARN: indexing failed (network/rate limit?). Your repo selection is saved — re-run with: pnpm index-github",
      );
    }
  }

  return nextState;
}

function hasGitHubAuth(): boolean {
  try {
    getGitHubToken();
    return true;
  } catch {
    return false;
  }
}

function ensureGitHubConfigFile(): void {
  if (existsSync(paths.config)) return;
  mkdirSync(join(paths.root, "config"), { recursive: true });
  if (existsSync(paths.configExample)) {
    copyFileSync(paths.configExample, paths.config);
  } else {
    writeFileSync(
      paths.config,
      `${JSON.stringify(
        {
          githubUsername: "",
          repos: [],
          maxCommitsPerRepo: 0,
          maxPullRequestsPerRepo: 0,
          includePullRequests: true,
          indexOnlyMyCommits: true,
        },
        null,
        2,
      )}\n`,
    );
  }
}

function printHandoff(state: RefineCvState): void {
  console.log("\n--- Next steps ---\n");
  let step = 1;
  console.log(`${step++}. Open Cursor chat and run: /onboard`);
  console.log("   (questionnaire gaps, base-cv-enhanced.md, gap-report.md)");
  if (state.installedPacks.includes("tailor-cv")) {
    console.log(`${step++}. Per application: /tailor-cv + paste job description`);
  }
  if (state.installedPacks.includes("toptal")) {
    console.log(`${step++}. Toptal: /toptal-pitch or /enhance-toptal-profile`);
  }
  if (state.installedPacks.includes("github-evidence")) {
    console.log(
      `${step++}. Weekly refresh: see docs/WEEKLY-REFRESH.md (/loop 7d /refresh-github-profile)`,
    );
  }
  console.log("\nRun pnpm validate anytime to check readiness.\n");
}

function maybeWarnToptalDegraded(packId: string): void {
  if (packId !== "toptal") return;
  if (!hasToptalGuideExtracts() && !hasToptalGuidePdfs()) {
    console.warn(
      "Toptal pack added in degraded mode — drop these PDFs into sources/toptal-guides/pdf/ and run pnpm extract-toptal-guides:\n" +
        TOPTAL_GUIDE_PDFS.map((name) => `  - ${name}`).join("\n"),
    );
  }
}

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof Error && err.name === "ExitPromptError") {
    console.log("\nSetup cancelled. Re-run anytime with: pnpm setup");
    process.exit(0);
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
