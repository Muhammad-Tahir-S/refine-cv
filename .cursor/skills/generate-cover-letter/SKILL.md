---
name: generate-cover-letter
description: >-
  Generate a tailored cover letter from a pasted job description using citable
  cover-letter best practices, mandatory grep of profile/github-index.json for
  PR/commit evidence (see sources/evidence-hierarchy.md), writing-style prose
  rules at draft time, and a mandatory avoid-ai-writing double-check before
  handoff. Use when the user pastes a JD and asks for a cover letter, or runs
  /generate-cover-letter. For a full tailored CV use tailor-cv; for Toptal
  pitches use generate-toptal-pitch.
---

# Generate cover letter

Standalone cover letter from a JD. Not full CV tailoring.

## Prerequisites

**Load in order (required):**

1. [sources/writing-style.md](../../../sources/writing-style.md) — anti-AI prose rules; applied while drafting, polish pass (§4) before saving
2. [sources/evidence-hierarchy.md](../../../sources/evidence-hierarchy.md) — **mandatory** index-first evidence; CV whiffing is a hard fail
3. [sources/cover-letter-best-practices.md](../../../sources/cover-letter-best-practices.md) — structure, length, evidence rules; cite source IDs from [sources/references.json](../../../sources/references.json)
4. `profile/questionnaire.md` § Writing voice — personal overrides (first person OK; lead with role fit and one verified proof point; no generic enthusiasm closers; **no PR references in `cover-letter.md`**; use questionnaire self-intro phrasing)

**Evidence sources (priority order — see evidence-hierarchy.md):**

1. **`profile/github-index.json`** — grep PR/commit titles for JD terms **before drafting**; primary source for body and anchor
2. `profile/questionnaire.md` — metrics, red lines, employer mapping
3. `profile/base-cv-enhanced.md` (fallback: `profile/base-cv.md`) — employment dates/titles only; not the source for body paragraphs
4. `profile/github-summary.md` — theme pointer into index only
5. `profile/gap-report.md` (if present) — known gaps; never claim across them

Rules: [.cursor/rules/cv-writing.mdc](../../rules/cv-writing.mdc), [.cursor/rules/writing-style.mdc](../../rules/writing-style.mdc)

If `base-cv-enhanced.md` is still a placeholder, complete onboarding first.

## Workflow

### 1. Obtain job description

Ask the user to paste the JD or give a file path. If a job folder for this
role already exists under `jobs/`, reuse it; otherwise create
`jobs/YYYY-MM-DD-company-role/` (lowercase, hyphens) and save
`job-description.md`.

Outputs for this skill: `cover-letter.md`, `cover-letter-report.md`.

### 2. Extract the JD's core

List: exact role title (and req number if present), 2–3 core required skills
(verbatim phrases), the problem the team is hiring to solve (stated or
inferred from the JD), seniority signals, and any employer instructions
(word limits, questions to answer). Employer instructions override defaults.

### 3. Company specifics

Collect 1–2 verifiable company-specific facts for the why-this-company
paragraph: product, stack named in the JD, engineering blog post, open-source
tool, or stated challenge. Prefer facts in the JD itself; use web search only
to confirm, never to invent. If nothing verifiable is found, ground the
paragraph in the JD's own stated problem.

### 4. Index search (mandatory — do not draft until done)

Follow [sources/evidence-hierarchy.md](../../../sources/evidence-hierarchy.md) §2:

1. Grep `profile/github-index.json` for JD keywords and synonyms.
2. Record hits in **`cover-letter-report.md` → Index search log** (repo, PR #, title, merged date, JD term, used?).
3. Prefer **merged** PRs with named shipped artifacts (components, screens, integrations, fixes).

**Ship gate:** ≥3 relevant merged PRs in the log, or document a genuine no-hit gap. Do not proceed to step 5 without this log.

### 5. Map evidence — pick one anchor from the index log

From the index search log (not from CV bullets), select:

- **One anchor thread** for the body: a chain of merged PRs or one major PR that hits the JD's core skill — constraint, what shipped (use PR artifact names), outcome. Depth beats breadth.
- **One opening proof point**: the single strongest **index-backed** fact (e.g. shipped X screen, built Y component, merged Z fix at operator scale).

`base-cv-enhanced.md` may supply years of experience and employer names only.

**Never invent** employers, projects, metrics, or company facts. Unsupported JD requirements go to the report as gaps.

### 6. Draft `cover-letter.md`

Follow [cover-letter-best-practices.md](../../../sources/cover-letter-best-practices.md) §2 structure:

1. **Opening** — role named, one-sentence introduction, the proof point
2. **Body (1–2 paragraphs)** — the anchor example: constraint, decision, shipped result
3. **Why this company** — the verified specific from step 3, connected to work already done
4. **Close** — one-sentence fit restatement, thanks, interest in a conversation

Format:

- First person, direct tone per questionnaire § Writing voice (self-intro phrasing; **never cite PR numbers or merge history** in the letter — index backs claims internally; describe shipped work in product terms)
- 250–400 words; target ≈300 or less for engineering roles unless the JD invites longer
- Named greeting when findable, else `Dear Hiring Manager`
- GitHub/portfolio links in a block below the sign-off, bare URLs
- Vary sentence openings; the letter is a writing sample

Draft **with writing-style.md rules active** (zero em dashes, no contrast
clichés, no Tier-1 vocabulary), then run the §4 polish pass before saving.

### 7. Double-check pass (mandatory)

Run the **avoid-ai-writing** skill
(`.cursor/skills/avoid-ai-writing/SKILL.md`) on the saved letter:

- Mode: **detect** first; context `investor-email` strictness is closest to
  a cover letter's high-trust audience; voice `professional`
- Fix every P0 and P1 finding directly in `cover-letter.md`; use judgment on P2
- Re-run detect once after fixes; record both passes in the report

This pass is not optional. A letter is not ready for handoff until the
second detect pass is clean of P0/P1 findings.

### 8. Write `cover-letter-report.md`

1. **Index search log** — JD term | repo | PR # | title | merged | used in letter? (required; see evidence-hierarchy.md §4)
2. **Evidence map** — claim in letter | source (`github-index.json` repo + PR # + title, or CV dates only) | verified?
3. **Company specifics** — fact used | where verified
4. **Gaps** — JD requirements not covered, honest list
5. **Best-practices checklist** — copy from [cover-letter-best-practices.md](../../../sources/cover-letter-best-practices.md); mark pass/fail
6. **Style pass** — table from [writing-style.md](../../../sources/writing-style.md) §5; mark pass/fail
7. **avoid-ai-writing audit** — findings from pass 1, fixes applied, pass 2 result
8. **Index ship gate** — confirm body paragraphs map to index log rows; no CV-whiff paragraphs

### 9. Handoff

Report the anchor chosen, gaps, and any questions before the user sends.
Offer `/tailor-cv` if they also need a tailored CV for the same role — do
not auto-run it.

## Anti-patterns

- **CV whiffing:** writing from `base-cv-enhanced.md` without grepping `github-index.json` first
- Repeating CV bullets in paragraph form (the letter adds detail from PR history, never restates)
- Vague UI claims without named shipped artifacts ("matched design", "pixel-perfect screens" with no PR referent)
- Skipping the index search log or shipping with fewer than three relevant PRs logged without documenting gaps
- "I am writing to express my interest…" and other mass-produced openers
- Generic company flattery with no verifiable referent
- Skipping or soft-skipping the avoid-ai-writing pass
- Claims that no evidence source supports
- **PR references in `cover-letter.md`:** PR numbers, "merged PRs," or merge history in employer-facing prose (questionnaire § Writing voice; index is internal only)
