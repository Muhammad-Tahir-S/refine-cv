---
name: onboard-profile
description: >-
  First-time setup: extract CV PDF, fill questionnaire, index GitHub repos,
  produce base-cv-enhanced.md and gap-report.md. Use when onboarding refine-cv
  or when profile files are still placeholders.
---

# Onboard profile

Run the setup sequence in [profile/ONBOARDING.md](../../../profile/ONBOARDING.md) (CV extract → repo discovery → index → questionnaire → enhanced CV → weekly refresh). That doc owns the step order; this skill adds the agent-only responsibilities it leaves to you.

## Agent responsibilities per step

1. **CV** — Confirm `profile/base-cv.pdf` exists; if not, ask for a path/upload before `pnpm extract-cv`. A manual paste into `profile/base-cv.md` is an accepted fallback.
2. **GitHub** — If `config/github-repos.json` repos is empty, run `pnpm list-repos` and have the user pick from `profile/github-repo-candidates.md`; write selections (include `githubUsername`). Verify the token, then run `pnpm index-github`. If repos stay empty, stop and request a repo list.
3. **Questionnaire** — Read `profile/base-cv.md` and `profile/github-summary.md` first, then ask **only** the gaps listed below. Do not ask for anything already in the CV or GitHub index. Write answers to `profile/questionnaire.md`.
4. **Enhanced CV + gap report** — Read [sources/cv-best-practices.md](../../../sources/cv-best-practices.md) and [sources/writing-style.md](../../../sources/writing-style.md). Write `profile/base-cv-enhanced.md` (stronger bullets, ATS structure, **same facts**) and `profile/gap-report.md` (table of unsupported/missing items). Tag GitHub-derived bullets per `github-summary.md`. Run the writing-style polish pass before saving.
5. **Handoff** — Tell the user to review `gap-report.md` before `/tailor-cv`, then arm the weekly refresh per [docs/WEEKLY-REFRESH.md](../../../docs/WEEKLY-REFRESH.md).

## Gaps to ask (only if not inferable from CV or GitHub)

- Target role family and seniority band
- Per employer: team scope and metrics willing to claim (ranges OK)
- Red lines: repos, employers, technologies, codenames
- Work authorization (if relevant)
- CV length preference (1 vs 2 pages)

**Completion criterion:** `base-cv-enhanced.md` and `gap-report.md` both exist and contain no placeholder text; every questionnaire gap above is answered or explicitly deferred.
