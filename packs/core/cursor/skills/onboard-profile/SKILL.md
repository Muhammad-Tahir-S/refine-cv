---
name: onboard-profile
description: >-
  Agent onboarding after pnpm setup: fill questionnaire gaps, produce
  base-cv-enhanced.md and gap-report.md. Use when running /onboard or when
  profile files are still placeholders.
---

# Onboard profile

Mechanical setup (CV extract, GitHub index, pack install) is handled by `pnpm setup`. This skill covers the **agent-only** steps from [profile/ONBOARDING.md](../../../profile/ONBOARDING.md).

## Preflight

Read `config/refine-cv.json`. If missing or incomplete, tell the user to run `pnpm setup` first.

| Flag | Required when | If false |
|------|---------------|----------|
| `cvIntakeCompleted` | always | Re-run setup CV step or confirm `profile/base-cv.md` exists |
| `githubConnectCompleted` | `github-evidence` pack installed | Re-run setup GitHub step or confirm `config/github-repos.json` has repos |

If `profile/base-cv-enhanced.md` and `profile/gap-report.md` exist with no placeholder text, onboarding is already complete — confirm with the user before overwriting.

## Agent responsibilities

1. **Questionnaire** — Read `profile/base-cv.md` and `profile/github-summary.md` (if present). Ask **only** the gaps below. Do not ask for anything already in the CV or GitHub index. Write answers into `profile/questionnaire.md` (seeded from `profile/questionnaire.example.md` by `pnpm setup`; copy the example yourself if it is missing).
2. **Enhanced CV + gap report** — Read [sources/cv-best-practices.md](../../../sources/cv-best-practices.md). Write `profile/base-cv-enhanced.md` (stronger bullets, ATS structure, **same facts**) and `profile/gap-report.md` (table of unsupported/missing items). Tag GitHub-derived bullets per `github-summary.md` when available.
3. **Handoff** — Tell the user to review `gap-report.md` before `/tailor-cv`. If `github-evidence` is installed, point them to [docs/WEEKLY-REFRESH.md](../../../docs/WEEKLY-REFRESH.md) for the weekly refresh loop.

## Gaps to ask (only if not inferable from CV or GitHub)

- Target role family and seniority band
- Per employer: team scope and metrics willing to claim (ranges OK)
- Red lines: repos, employers, technologies, codenames
- Work authorization (if relevant)
- CV length preference (1 vs 2 pages)

**Completion criterion:** `base-cv-enhanced.md` and `gap-report.md` both exist and contain no placeholder text; every questionnaire gap above is answered or explicitly deferred.
