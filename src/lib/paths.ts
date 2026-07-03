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
  toptalProfileCurrent: join(ROOT, "profile", "toptal-profile-current.md"),
  toptalProfileEnhanced: join(ROOT, "profile", "toptal-profile-enhanced.md"),
  toptalProfileGapReport: join(ROOT, "profile", "toptal-profile-gap-report.md"),
  cvBestPractices: join(ROOT, "sources", "cv-best-practices.md"),
  toptalBestPractices: join(ROOT, "sources", "toptal-best-practices.md"),
  toptalReferences: join(ROOT, "sources", "toptal-references.json"),
  toptalMatchingHandbook: join(
    ROOT,
    "sources",
    "toptal-guides",
    "job-application-matching-handbook.md",
  ),
  toptalProfileGuide: join(
    ROOT,
    "sources",
    "toptal-guides",
    "developer-profile-creation-guide.md",
  ),
  tailorSkill: join(ROOT, ".cursor", "skills", "tailor-cv", "SKILL.md"),
  enhanceToptalProfileSkill: join(
    ROOT,
    ".cursor",
    "skills",
    "enhance-toptal-profile",
    "SKILL.md",
  ),
  generateToptalPitchSkill: join(
    ROOT,
    ".cursor",
    "skills",
    "generate-toptal-pitch",
    "SKILL.md",
  ),
  cvTemplateCss: join(ROOT, "templates", "cv", "resume.css"),
} as const;
