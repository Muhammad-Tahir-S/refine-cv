import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { paths } from "./paths.js";
import { loadGitHubConfig } from "./config.js";

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

  if (existsSync(paths.tailorSkill)) check("ok", "tailor-cv skill", counts);
  else check("fail", "missing tailor-cv skill", counts);

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

  console.log(`\nSummary: ${counts.ok} ok, ${counts.warn} warn, ${counts.fail} fail`);
  return counts.fail > 0 ? 1 : 0;
}
