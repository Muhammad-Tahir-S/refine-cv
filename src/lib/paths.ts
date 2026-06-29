import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(SRC_DIR, "..", "..");

export const paths = {
  root: ROOT,
  config: join(ROOT, "config", "github-repos.json"),
  profile: join(ROOT, "profile"),
  baseCvPdf: join(ROOT, "profile", "base-cv.pdf"),
  baseCvMd: join(ROOT, "profile", "base-cv.md"),
  baseCvEnhanced: join(ROOT, "profile", "base-cv-enhanced.md"),
  questionnaire: join(ROOT, "profile", "questionnaire.md"),
  githubIndex: join(ROOT, "profile", "github-index.json"),
  githubSummary: join(ROOT, "profile", "github-summary.md"),
  indexState: join(ROOT, "profile", "index-state.json"),
  refreshLog: join(ROOT, "profile", "refresh-log.md"),
  repoCandidates: join(ROOT, "profile", "github-repo-candidates.md"),
  gapReport: join(ROOT, "profile", "gap-report.md"),
  cvBestPractices: join(ROOT, "sources", "cv-best-practices.md"),
  tailorSkill: join(ROOT, ".cursor", "skills", "tailor-cv", "SKILL.md"),
  cvTemplateCss: join(ROOT, "templates", "cv", "resume.css"),
} as const;
