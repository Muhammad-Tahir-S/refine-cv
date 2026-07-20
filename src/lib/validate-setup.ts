import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { paths } from "./paths.js";
import { loadGitHubConfig } from "./config.js";
import { loadJobSourcesConfig } from "./jobs/sources/registry.js";
import { loadJobSearchConfigAt } from "./jobs/scan-policy.js";
import { LINKEDIN_PROFILE_DIR } from "./jobs/state.js";

type Status = "ok" | "warn" | "fail";

function check(status: Status, msg: string, counts: { ok: number; warn: number; fail: number }) {
  const label = status === "ok" ? "OK  " : status === "warn" ? "WARN" : "FAIL";
  console.log(`${label} ${msg}`);
  counts[status] += 1;
}

export function runValidateSetup(): number {
  const counts = { ok: 0, warn: 0, fail: 0 };

  if (existsSync(paths.cvBestPractices)) check("ok", "sources/cv-best-practices.md", counts);
  else check("fail", "missing sources/cv-best-practices.md", counts);

  if (existsSync(paths.writingStyle)) check("ok", "sources/writing-style.md", counts);
  else check("fail", "missing sources/writing-style.md", counts);

  if (existsSync(paths.tailorSkill)) check("ok", "tailor-cv skill", counts);
  else check("fail", "missing tailor-cv skill", counts);

  if (existsSync(paths.avoidAiWritingSkill)) check("ok", "avoid-ai-writing skill", counts);
  else check("warn", "missing avoid-ai-writing skill", counts);

  if (existsSync(paths.toptalBestPractices)) check("ok", "sources/toptal-best-practices.md", counts);
  else check("warn", "missing sources/toptal-best-practices.md", counts);

  if (existsSync(paths.toptalMatchingHandbook))
    check("ok", "toptal-guides/job-application-matching-handbook.md", counts);
  else check("fail", "missing toptal matching handbook extract", counts);

  if (existsSync(paths.toptalProfileGuide))
    check("ok", "toptal-guides/developer-profile-creation-guide.md", counts);
  else check("fail", "missing toptal profile creation guide extract", counts);

  if (existsSync(paths.enhanceToptalProfileSkill)) check("ok", "enhance-toptal-profile skill", counts);
  else check("warn", "missing enhance-toptal-profile skill", counts);

  if (existsSync(paths.generateToptalPitchSkill)) check("ok", "generate-toptal-pitch skill", counts);
  else check("warn", "missing generate-toptal-pitch skill", counts);

  if (existsSync(paths.toptalProfileCurrent)) check("ok", "profile/toptal-profile-current.md", counts);
  else check("warn", "no Toptal profile snapshot — paste via /enhance-toptal-profile", counts);

  if (existsSync(paths.baseCvPdf)) check("ok", "profile/base-cv.pdf", counts);
  else check("warn", "profile/base-cv.pdf not found", counts);

  if (existsSync(paths.baseCvMd)) {
    const md = readFileSync(paths.baseCvMd, "utf8");
    if (md.includes("Pending") || md.includes("not yet")) {
      check("warn", "profile/base-cv.md not extracted yet — pnpm extract-cv", counts);
    } else {
      check("ok", "profile/base-cv.md extracted", counts);
    }
  } else {
    check("warn", "profile/base-cv.md missing", counts);
  }

  try {
    const cfg = loadGitHubConfig();
    if (cfg.repos.length > 0) {
      check("ok", `config/github-repos.json has ${cfg.repos.length} repo(s)`, counts);
    } else {
      check("warn", "no repos in config — pnpm list-repos then add selections", counts);
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

  if (existsSync(paths.baseCvEnhanced)) {
    const e = readFileSync(paths.baseCvEnhanced, "utf8");
    if (e.includes("Pending onboarding")) {
      check("warn", "onboarding not complete — ask agent to onboard", counts);
    } else {
      check("ok", "base-cv-enhanced.md ready", counts);
    }
  } else {
    check("warn", "base-cv-enhanced.md missing", counts);
  }

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

  if (existsSync(paths.scanJobsSkill)) {
    check("ok", "scan-jobs skill", counts);
  } else {
    check("fail", "missing scan-jobs skill", counts);
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

  console.log(`\nSummary: ${counts.ok} ok, ${counts.warn} warn, ${counts.fail} fail`);
  return counts.fail > 0 ? 1 : 0;
}
