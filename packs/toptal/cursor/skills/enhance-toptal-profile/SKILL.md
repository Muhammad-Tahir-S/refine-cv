---
name: enhance-toptal-profile
description: >-
  Enhance baseline Toptal platform profile (bio, skills, portfolio) from a pasted
  snapshot using Toptal best practices and profile/GitHub evidence. Use when
  enhancing Toptal profile, updating bio/skills/portfolio, or running
  /enhance-toptal-profile. Not for JD-specific skill retagging.
---

# Enhance Toptal profile

Baseline profile optimization only — not per-job tailoring.

## Prerequisites

**Load in order:**

1. [sources/toptal-guides/developer-profile-creation-guide.md](../../../sources/toptal-guides/developer-profile-creation-guide.md) — primary authority for profile sections. *Degraded mode:* the guide extracts (items 1–2) are user-supplied and may be missing — if so, skip them, rely on `toptal-best-practices.md` alone, and note the degraded basis in the gap report.
2. [sources/toptal-guides/job-application-matching-handbook.md](../../../sources/toptal-guides/job-application-matching-handbook.md) — §8 profile requirements
3. [sources/toptal-best-practices.md](../../../sources/toptal-best-practices.md) — **§2 profile rules, §8 paste checklist** (this skill points here rather than restating the rules)
4. [sources/toptal-references.json](../../../sources/toptal-references.json) for citations

- Base CV: `profile/base-cv-enhanced.md` (fallback: `profile/base-cv.md`)
- `profile/github-summary.md`, `profile/questionnaire.md`, `profile/gap-report.md` (if present)
- Rule: [.cursor/rules/toptal-writing.mdc](../../rules/toptal-writing.mdc)

If `base-cv-enhanced.md` is still a placeholder, complete onboarding first.

## Workflow

### 1. Obtain current Toptal profile

Ask the user to paste their current profile (bio, skills with levels, portfolio entries) or provide a path. Save to `profile/toptal-profile-current.md`.

### 2. Load evidence

| Source | Use for |
|--------|---------|
| `toptal-profile-current.md` | What is live today; diff baseline |
| `base-cv-enhanced.md` | Employment facts, titles, stack |
| `github-summary.md` | Technical proof; respect `verified-from-github` vs `needs-your-confirmation` |
| `questionnaire.md` | Metrics, red lines, target-role emphasis |
| `gap-report.md` | Known unsupported claims to avoid |

### 3. Write `profile/toptal-profile-enhanced.md`

Sectioned copy-paste blocks for each Toptal field, written to [toptal-best-practices.md](../../../sources/toptal-best-practices.md) §2 and validated against the §8 checklist. Cover every section, honoring these hard criteria:

- **About** — ~3 sentences, third person, opens with the strongest verified achievement or scale
- **"The most amazing…"** — one specific verified project, non-generic
- **Work bullets** — 3–10 per role, 50–250 characters, past-tense active verbs, quantified where verified
- **Skills** — rated Competent / Strong / Expert honestly; **every skill connected to a work or portfolio entry**; flag the top **8** for Expertise highlights; first **15** feed the public About tags
- **External profiles** — GitHub, LinkedIn, personal site from CV/questionnaire
- **Headshot & availability** — note gaps against the profile-guide headshot rules; time zone, working hours, and flexibility from the questionnaire
- **Portfolio** — **minimum 5** developer projects, each with title, a 2–4 sentence outcome-focused description, a link, and stack/domain tags

Prioritize the verified stack from CV and GitHub; prefer projects with indexed evidence or public demos.

**Completion criterion:** every §8 checklist row is satisfied in the output or listed as a gap in the gap report — no section left blank without a gap note.

### 4. Write `profile/toptal-profile-gap-report.md`

1. Weak or missing portfolio items — what to add or replace
2. Skills to avoid claiming — no verified evidence
3. Skills under-leveled or missing that should appear on the profile
4. Metrics needing user confirmation — from `needs-your-confirmation` tags
5. Blocking questions only

### 5. Handoff

Report the **top 3 recommended changes** and any blocking questions. Remind the user to paste sections into Toptal manually and to run `/refresh-github-profile` periodically so evidence stays current.

## Not in scope

- JD-specific skill retagging for individual applications (use **generate-toptal-pitch**)
- Full CV tailoring (use **tailor-cv**)
