---
name: tailor-cv
description: >-
  Tailor CV to a job description using citable ATS/human best practices,
  profile evidence, GitHub summary, and anti-AI writing style rules. Use when
  the user pastes a JD, mentions tailoring a CV, ATS optimization, cover letters,
  or runs /tailor-cv in refine-cv.
---

# Tailor CV

## Prerequisites

- [sources/writing-style.md](../../../sources/writing-style.md) loaded and followed (polish pass before saving prose)
- [sources/cv-best-practices.md](../../../sources/cv-best-practices.md) loaded and followed
- Base CV: `profile/base-cv-enhanced.md` (fallback: `profile/base-cv.md`)
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

### 4. Map evidence to JD

| Source | Use for |
|--------|---------|
| `base-cv-enhanced.md` | Employment facts, dates, titles |
| `github-summary.md` | Technical proof; respect `verified-from-github` vs `needs-your-confirmation` |
| `questionnaire.md` | Metrics, red lines, target role emphasis |

**Never invent** employers, titles, dates, or metrics. Flag gaps in `match-report.md`.

### 5. Write `tailored-cv.md`

- Reverse-chronological; standard headings (`Experience`, `Education`, `Skills` or `Professional Experience`)
- Reorder bullets so JD-critical evidence appears first per role
- Mirror JD keywords **naturally** in bullets and skills section
- Single-column plain Markdown (ATS-friendly when exported to PDF)
- Omit anything in questionnaire red lines

**Completion criterion:** every required keyword from the step-3 map is either placed naturally in the CV or logged as a gap in `match-report.md` — none silently dropped.

Run the [writing-style.md](../../../sources/writing-style.md) §4 polish pass on `tailored-cv.md` before continuing. For cover letters, optionally run `/avoid-ai-writing` in detect mode before handoff.

### 6. Write `match-report.md`

Include:

1. **Keyword coverage table** — JD term | present? | where in CV | notes
2. **Risks** — stuffing, format issues, unsupported claims
3. **Questions for user** — only if blocking accuracy
4. **Human + ATS checklist** — copy from [sources/cv-best-practices.md](../../../sources/cv-best-practices.md) checklist section; mark pass/fail
5. **Style pass** — from [sources/writing-style.md](../../../sources/writing-style.md) §5; mark pass/fail
6. **PDF export checklist** — selectable text, contact info in body, no tables/columns/graphics, employer format preference (PDF vs DOCX)

### 7. Optional `cover-letter-hooks.md`

3–5 factual hooks linking your evidence to the role (no invented stories). Run the writing-style polish pass; zero em dashes.

### 8. Optional `cover-letter.md`

When the user asks for a cover letter:

- First person; direct tone per `profile/questionnaire.md` § Writing voice
- Follow [sources/writing-style.md](../../../sources/writing-style.md) (zero em dashes, no contrast clichés)
- Ground every claim in CV/GitHub evidence; no invented stories
- Run polish pass before saving; include **Style pass** in `match-report.md`

### 9. Render `tailored-cv.pdf`

Run:

```bash
pnpm render-cv jobs/YYYY-MM-DD-company-role/tailored-cv.md
```

Confirm the PDF has no internal evidence tags or metadata footer. For template calibration, compare `profile/base-cv-preview.pdf` with `profile/base-cv.pdf`.

## Toptal application pitches

For Toptal job application paragraphs (third-person pitch from a pasted JD), use **generate-toptal-pitch** (`.cursor/skills/generate-toptal-pitch/SKILL.md`) or `/toptal-pitch` — not this skill.

## Anti-patterns

Follow the anti-patterns in [sources/cv-best-practices.md](../../../sources/cv-best-practices.md) (keyword stuffing, tables/columns/graphics, non-standard headings, SEO-blog rationale — cite `sources/references.json` IDs only). Repo-specific guardrail: never promote `needs-your-confirmation` GitHub bullets into the final CV without user approval.
