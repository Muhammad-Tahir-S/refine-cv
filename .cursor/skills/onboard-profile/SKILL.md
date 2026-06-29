---
name: onboard-profile
description: >-
  First-time setup: extract CV PDF, fill questionnaire, index GitHub repos,
  produce base-cv-enhanced.md and gap-report.md. Use when onboarding refine-cv
  or when profile files are still placeholders.
---

# Onboard profile

Follow [profile/ONBOARDING.md](../../../profile/ONBOARDING.md).

## Checklist

1. **CV**
   - Confirm `profile/base-cv.pdf` exists; if not, ask user for path/upload.
   - Run `pnpm extract-cv` or accept manual paste into `profile/base-cv.md`.

2. **GitHub**
   - Run `pnpm list-repos` if `config/github-repos.json` repos is empty; user selects from `profile/github-repo-candidates.md`.
   - Write selections to `config/github-repos.json` (include `githubUsername`).
   - Verify GitHub token; run `pnpm index-github`.
   - If repos empty, stop and request repo list.

3. **Questionnaire**
   - Read `profile/base-cv.md` and `profile/github-summary.md`.
   - Ask **only** gaps: metrics, red lines, target role, per-employer scope not inferable.
   - Update `profile/questionnaire.md` with answers.

4. **Enhanced CV + gap report**
   - Read [sources/cv-best-practices.md](../../../sources/cv-best-practices.md).
   - Write `profile/base-cv-enhanced.md`: stronger bullets, ATS structure, **same facts**.
   - Write `profile/gap-report.md`: table of unsupported/missing items.
   - Tag GitHub-derived bullets per `github-summary.md` tags.

5. **Handoff**
   - Tell user to review `gap-report.md` before `/tailor-cv`.
   - Arm weekly refresh: `/loop 7d /refresh-github-profile` (see [docs/WEEKLY-REFRESH.md](../../../docs/WEEKLY-REFRESH.md)).

## Questions to ask (if not inferable)

- Target role family and seniority band
- Work authorization (if relevant)
- Per employer: team scope, metrics willing to claim (ranges OK)
- Red lines: repos, employers, technologies, codenames
- CV length preference (1 vs 2 pages)

Do not ask for information already in the CV or GitHub index.
