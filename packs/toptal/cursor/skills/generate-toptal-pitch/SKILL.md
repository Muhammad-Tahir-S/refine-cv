---
name: generate-toptal-pitch
description: >-
  Generate a third-person Toptal job application pitch from a pasted job
  description using Toptal best practices and profile/GitHub evidence. Use when
  the user pastes a Toptal JD, asks for an application pitch, or runs
  /toptal-pitch. Not for full CV tailoring — use tailor-cv for that.
---

# Generate Toptal pitch

Per-job application pitch — not full CV tailoring.

## Prerequisites

**Load in order:**

1. [sources/writing-style.md](../../../sources/writing-style.md) — anti-AI prose; polish pass before saving
2. [sources/evidence-hierarchy.md](../../../sources/evidence-hierarchy.md) — **mandatory** index-first evidence
3. [sources/toptal-guides/job-application-matching-handbook.md](../../../sources/toptal-guides/job-application-matching-handbook.md) — **§10–12 are the pitch basis**; also §9 Application Questions. *Degraded mode:* this extract is user-supplied and may be missing — if so, skip it, rely on `toptal-best-practices.md` alone, and note the degraded basis in the pitch match report.
4. [sources/toptal-best-practices.md](../../../sources/toptal-best-practices.md) — **§3 encodes the pitch doctrine as citable rules; §7 is the paste checklist** (this skill points here rather than restating the rules)
5. [sources/toptal-references.json](../../../sources/toptal-references.json) for citations

- `profile/github-index.json` — **grep before drafting**; primary source for pitch examples and projects
- Base CV: `profile/base-cv-enhanced.md` (fallback: `profile/base-cv.md`) — employment scaffold only
- `profile/github-summary.md`, `profile/questionnaire.md`, `profile/gap-report.md` (if present)
- Rules: [.cursor/rules/toptal-writing.mdc](../../rules/toptal-writing.mdc), [.cursor/rules/writing-style.mdc](../../rules/writing-style.mdc)

If `base-cv-enhanced.md` is still a placeholder, complete onboarding first.

## Workflow

### 1. Obtain job description

Ask the user to paste the Toptal JD or provide a file path. Save it.

### 2. Create job folder

Slug `jobs/YYYY-MM-DD-company-role/` (lowercase, hyphens). Use a neutral slug from client domain or role when the company is confidential (e.g. `jobs/2026-06-17-reddit-pro-frontend/`).

Create `job-description.md` (full JD), `pitch.md` (pending), `pitch-match-report.md` (pending).

### 3. Build keyword map from JD

List: required skills/technologies (verbatim phrases), nice-to-haves, seniority and scope signals, domain/industry signals, and repeated keywords (weight higher).

### 4. Index search (mandatory)

Follow [sources/evidence-hierarchy.md](../../../sources/evidence-hierarchy.md) §2. Grep `profile/github-index.json` for JD keywords; record **Index search log** in `pitch-match-report.md` before step 5.

### 5. Map evidence to JD

| Source | Use for |
|--------|---------|
| `github-index.json` | **Primary** — pitch examples, 2–3 projects, specific shipped artifacts |
| `base-cv-enhanced.md` | Employment facts, titles, stack list |
| `github-summary.md` | Pointer into index |
| `questionnaire.md` | Metrics, red lines, overlap/availability |
| `gap-report.md` | Known gaps to avoid claiming |

**Never invent** employers, projects, metrics, or skills (best-practices §6). Pitch examples must cite index PRs, not CV bullet paraphrase.

### 6. Gate — apply the pitch doctrine before drafting

**Do not write the pitch until this step is done.** Map verified evidence to the handbook §10–12 framework as encoded in [toptal-best-practices.md](../../../sources/toptal-best-practices.md) §3 (goals, focus, wow factor, strong §11 / weak §12 patterns). From the handbook §10 question table, decide which themes *this* JD makes relevant — cover those, defer the rest to application answers, or omit for lack of evidence. Do not cram every theme.

### 7. Write `pitch.md`

- **Main paragraph** — one block, third person, ~**500 characters** when the form is character-limited (§10 wow factor). If the form allows more, stay dense and client-focused (~120 words max unless the JD invites longer).
- Satisfy every applicable rule in [toptal-best-practices.md](../../../sources/toptal-best-practices.md) §3: client-focused fit for *this* posting, depth in industry/relevant skill/similar needs, a personal story with **specific examples**, **2–3 evidence-backed projects** with bare URLs, quantified results where verified, skills ranked and qualified honestly, one notable achievement, genuine enthusiasm, and availability/overlap/interview timing when the JD asks.
- Note the character count under the paragraph when near the 500 limit.
- Optional project URLs below for scanning.

#### Copy-paste format (required)

All **paste-ready content** in `pitch.md` — main pitch, short pitch, application answers, and project links — must be **plain text** so the user can copy directly into Toptal forms without cleanup:

- **No markdown emphasis** — no `**bold**`, `*italic*`, or `_underline_`
- **No markdown links** — no `[label](url)` or `[label][ref]`; use bare `https://…` URLs inline or on their own line
- **No square brackets** in paste blocks (except inside URLs if unavoidable)
- **No backticks** around terms in paste blocks
- File **headings and labels** (e.g. `## Application answers`) may stay markdown for repo navigation; only the copy-paste blocks themselves must be plain text
- Prefer commas and periods over bullet lists inside the main pitch paragraph; use simple `- url - description` lines only in the project-links section if needed

**Completion criterion:** every item on the §7 paste checklist is either satisfied in the paragraph or logged as a gap in `pitch-match-report.md` — none silently skipped.

Run the [writing-style.md](../../../sources/writing-style.md) §4 polish pass on `pitch.md` before continuing. Optionally run `/avoid-ai-writing` in detect mode before handoff.

### 8. Write `pitch-match-report.md`

1. **Index search log** — required (evidence-hierarchy.md §4)
2. **Pitch doctrine coverage** — handbook §10 themes | covered in pitch? | index PR # / evidence source | notes (mark N/A when not JD-relevant or unevidenced)
2. **Keyword coverage** — JD term | present? | where in evidence | notes
3. **Risks** — overclaiming, weak overlap, voice/§12 weak-pattern risks
4. **Gaps** — unsupported skills/domains (honest list)
5. **Optional application answers** — third person, plain text (same copy-paste rules as §6); use `added in the pitch.` when redundant (handbook §9); include overlap hours, interview availability, and start date if the JD asks
6. **Style pass** — from [sources/writing-style.md](../../../sources/writing-style.md) §5; mark pass/fail
7. **Toptal pitch checklist** — from [toptal-best-practices.md](../../../sources/toptal-best-practices.md) §7; mark pass/fail

Reuse the table shape from existing job `match-report.md` / `pitch-match-report.md` files where helpful.

### 9. Handoff

Report keyword match highlights, gaps, and any **questions** before the user submits. The user may run `/tailor-cv` separately if they also need a tailored CV PDF for the same role — do **not** auto-run it.
