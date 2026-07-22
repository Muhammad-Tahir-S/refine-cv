---
name: tailor-cv
description: >-
  Tailor CV to a job description using citable ATS/human best practices,
  mandatory github-index.json PR/commit evidence (sources/evidence-hierarchy.md),
  and anti-AI writing style rules. Use when the user pastes a JD, mentions
  tailoring a CV, ATS optimization, cover letters, or runs /tailor-cv in
  refine-cv.
---

# Tailor CV

## Prerequisites

- [sources/writing-style.md](../../../sources/writing-style.md) loaded and followed (polish pass before saving prose)
- [sources/evidence-hierarchy.md](../../../sources/evidence-hierarchy.md) loaded and followed (**index search before tailored bullets**)
- [sources/cv-best-practices.md](../../../sources/cv-best-practices.md) loaded and followed
- `profile/github-index.json` — grep for JD terms before writing bullets
- `profile/base-cv-enhanced.md` (fallback: `profile/base-cv.md`) — employment scaffold only
- `profile/github-summary.md`, `profile/questionnaire.md`
- Rules: [.cursor/rules/cv-writing.mdc](../../rules/cv-writing.mdc), [.cursor/rules/writing-style.mdc](../../rules/writing-style.mdc)

If `base-cv-enhanced.md` is still a placeholder, complete onboarding first (see `profile/ONBOARDING.md`).

## Workflow

### 1. Obtain job description

Ask the user to paste the JD or provide a file path. If pasted in chat, save it.

### 2. Create job folder

Slug format: `jobs/YYYY-MM-DD-company-role/` (lowercase, hyphens, no spaces).

Create:

- `job-description.md` — full JD text
- `tailored-cv.md` — output (pending)
- `tailored-cv.pdf` — rendered PDF (pending)
- `match-report.md` — output (pending)
- `cover-letter-hooks.md` — optional 3–5 bullets
- `cover-letter.md` — optional when user requests a cover letter

### 3. Build keyword map from JD

Extract and list:

- Required skills / technologies (verbatim phrases from JD)
- Nice-to-haves
- Seniority signals (years, lead/staff/principal, scope)
- Repeated keywords (weight higher)

Use both acronym and long form where the JD implies both (see best practices).

### 4. Index search (mandatory — do not write CV until done)

Follow [sources/evidence-hierarchy.md](../../../sources/evidence-hierarchy.md) §2:

1. Grep `profile/github-index.json` for each required JD keyword and synonyms.
2. Record hits in **`match-report.md` → Index search log** (repo, PR #, title, merged date, JD term).
3. Prefer merged PRs with named shipped artifacts for tailored bullets.

**Ship gate:** ≥3 relevant merged PRs logged, or document no-hit gaps per required skill.

### 5. Map evidence to JD

| Source | Use for |
|--------|---------|
| `github-index.json` | **Primary** — tailored bullet content, technical proof, PR-backed examples |
| `base-cv-enhanced.md` | Employment facts, dates, titles only |
| `github-summary.md` | Pointer into index |
| `questionnaire.md` | Metrics, red lines, target role emphasis |

**Never invent** employers, titles, dates, or metrics. Top two bullets per relevant role must trace to index log rows. Flag gaps in `match-report.md`.

### 6. Write `tailored-cv.md`

- Reverse-chronological; standard headings (`Experience`, `Education`, `Skills` or `Professional Experience`)
- Reorder bullets so JD-critical **index-backed** evidence appears first per role
- Rewrite bullets from PR titles/artifacts; do not paraphrase `base-cv-enhanced.md` bullets without index lookup
- Mirror JD keywords **naturally** in bullets and skills section
- Single-column plain Markdown (ATS-friendly when exported to PDF)
- Omit anything in questionnaire red lines

**Completion criterion:** every required keyword from the step-3 map is either placed naturally in the CV or logged as a gap in `match-report.md` — none silently dropped.

Run the [writing-style.md](../../../sources/writing-style.md) §4 polish pass on `tailored-cv.md` before continuing. For cover letters, optionally run `/avoid-ai-writing` in detect mode before handoff.

### 7. Write `match-report.md`

Include:

1. **Index search log** — JD term | repo | PR # | title | merged | used in CV? (required)
2. **Keyword coverage table** — JD term | present? | where in CV | index PR # | notes
3. **Risks** — stuffing, format issues, unsupported claims, CV whiffing
4. **Questions for user** — only if blocking accuracy
5. **Human + ATS checklist** — copy from [sources/cv-best-practices.md](../../../sources/cv-best-practices.md) checklist section; mark pass/fail
6. **Style pass** — from [sources/writing-style.md](../../../sources/writing-style.md) §5; mark pass/fail
7. **PDF export checklist** — selectable text, contact info in body, no tables/columns/graphics, employer format preference (PDF vs DOCX)
8. **Index ship gate** — top bullets per role map to log rows; no CV-whiff-only bullets

### 8. Optional `cover-letter-hooks.md`

3–5 factual hooks from **index log** entries linking PR-backed work to the role (no invented stories). Run the writing-style polish pass; zero em dashes.

### 9. Optional `cover-letter.md`

When the user asks for a cover letter, apply the **generate-cover-letter** skill (`.cursor/skills/generate-cover-letter/SKILL.md`) reusing this job's folder. That skill owns cover-letter structure, evidence mapping, the writing-style polish pass, and the mandatory avoid-ai-writing double-check.

### 10. Render `tailored-cv.pdf`

Run:

```bash
pnpm render-cv jobs/YYYY-MM-DD-company-role/tailored-cv.md
```

Confirm the PDF has no internal evidence tags or metadata footer. For template calibration, render a preview of the base CV (`pnpm render-cv profile/base-cv-enhanced.md --out profile/base-cv-preview.pdf`) and compare it with the original `profile/base-cv.pdf`.

## Toptal application pitches

For Toptal job application paragraphs (third-person pitch from a pasted JD), use **generate-toptal-pitch** (`.cursor/skills/generate-toptal-pitch/SKILL.md`) or `/toptal-pitch` — not this skill.

## Anti-patterns

Follow the anti-patterns in [sources/cv-best-practices.md](../../../sources/cv-best-practices.md) and [sources/evidence-hierarchy.md](../../../sources/evidence-hierarchy.md) (CV whiffing, vague UI claims without PR referents). Repo-specific guardrail: never promote `needs-your-confirmation` GitHub bullets into the final CV without user approval when ownership is genuinely unclear.
