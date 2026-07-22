# Evidence hierarchy — job tailoring

**Scope:** All job-specific outputs in refine-cv: tailored CVs, cover letters, cover-letter hooks, Toptal pitches, match reports, and pitch-match reports.

**Goal:** Every technical claim in tailored prose must trace to **concrete shipped work** in `profile/github-index.json` (merged PR titles, commit subjects), not to a paraphrase of `profile/base-cv-enhanced.md`.

---

## 1. Source roles (what each file is for)

| Source | Use for | Do **not** use for |
|--------|---------|-------------------|
| `profile/github-index.json` | **Primary.** Grep for JD keywords; pick merged PRs/commits; name what shipped (component, screen, fix, integration) | Employment dates or titles |
| `profile/questionnaire.md` | Metrics, red lines, employer mapping (org → product), writing voice | Bullets when index has richer PR evidence |
| `profile/base-cv-enhanced.md` | Employer names, titles, date ranges, baseline skill list | Cover-letter body, tailored CV bullets, or pitch examples without index lookup |
| `profile/github-summary.md` | Quick theme scan; pointer into index | Substitute for reading index PR titles |
| `profile/gap-report.md` | Known gaps; never claim across them | — |

**CV whiffing (hard ban):** Drafting tailored prose by rearranging or softening `base-cv-enhanced.md` bullets without searching `github-index.json` first. If the letter or CV could have been written without opening the index, the run failed.

---

## 2. Mandatory index search (before any tailored prose)

Run **before** writing `cover-letter.md`, `tailored-cv.md`, `pitch.md`, or `cover-letter-hooks.md`:

1. **Extract JD terms** — required skills, product nouns (dashboard, login, auth, animation, a11y, etc.), stack names.
2. **Grep `profile/github-index.json`** — search PR `title` fields (and commit messages if present) for those terms and close synonyms (e.g. `accessibility` → `keyboard`, `focus`, `aria`; `animation` → `transition`, `loader`, `skeleton`).
3. **Build an index search log** in the job report (see §4). Include repo, PR number, title, merged date if present, and which JD term matched.
4. **Select evidence:**
   - Prefer **merged** PRs with specific shipped artifacts (component names, screen names, integrations).
   - Prefer **recent** work when the JD is senior/current-stack.
   - Chain related PRs into one story when useful (e.g. build MultiLineChart → integrate → campaign dashboard screen).
5. **Scaffold from CV only** — opening line may cite years of experience and employer names from `base-cv-enhanced.md`; all **proof** comes from the index log.

If the index returns no hits for a required JD skill, log it as a **gap**. Do not backfill from CV wording.

---

## 3. How to write from PR history (not from CV bullets)

**Cover letters and pitches**

- **Opening proof:** one index-backed fact (e.g. shipped User Radar dashboard UI, built AI widget login page).
- **Body anchor:** one thread of merged PRs with constraint → what you built/fixed → outcome operators/users see.
- Name **artifacts** readers recognize: `MultiLineChart`, `DashboardMetric`, login deep-link return, keyboard nav on dropdowns — not vague lines like "matched design" or "built responsive UI."

**Tailored CV bullets**

- Rewrite bullets so each JD-critical bullet cites **what shipped** from PR titles, not the generic CV phrasing.
- At least the **top two bullets per relevant role** must be traceable to index entries in `match-report.md`.
- Keep employment facts (company, title, dates) from CV; swap bullet **content** from index when they differ.

**Anti-patterns**

- "Screens had to match design" / "worked from Figma specs" without a named screen or PR
- Listing Chakra/Tailwind/design-system bullets copied from CV when index has specific components
- "Three products in parallel" as the only proof (questionnaire metric is OK once; not the whole letter)
- Internal ticket IDs in user-facing prose unless questionnaire allows (PR **titles** are fine)

---

## 4. Report requirements (enforced)

Every job folder report must include an **Index search log** section:

```markdown
## Index search log

| JD term searched | Repo | PR # | Title | Merged | Used in output? |
|------------------|------|------|-------|--------|-----------------|
| dashboard | addressable-io/a9e-mono | 3859 | User Radar Dashboard UI | 2025-08-11 | cover letter ¶2 |
```

**Evidence map** rows must cite `github-index.json` (repo + PR # + title) for each technical claim. CV-only rows are limited to dates, titles, and years of experience.

**Ship gate:** Do not hand off `cover-letter.md` or `tailored-cv.md` until:

- [ ] Index search log has ≥3 relevant merged PRs **or** documents a genuine no-hit gap
- [ ] Every body paragraph / top tailored bullet maps to at least one log row
- [ ] No paragraph is CV-bullet paraphrase only (spot-check: remove CV file — claims should still be provable from log)

---

## 5. `needs-your-confirmation` and red lines

- PRs in `github-index.json` are indexed facts; `github-summary.md` may tag them `needs-your-confirmation` when ownership is unclear.
- Use indexed PR titles for **this user's** tailoring runs unless `questionnaire.md` red lines forbid a specific claim.
- Do not invent metrics or employers. Do not cite repos outside `config/github-repos.json`.

---

## 6. Load order (with other sources)

1. [sources/writing-style.md](writing-style.md)
2. **This file** (`sources/evidence-hierarchy.md`)
3. Domain authority: [cv-best-practices.md](cv-best-practices.md) or [cover-letter-best-practices.md](cover-letter-best-practices.md) or Toptal guides
4. `profile/github-index.json` — grep before drafting
5. `profile/base-cv-enhanced.md` — scaffold only

Skills: **generate-cover-letter**, **tailor-cv**, **generate-toptal-pitch**, **enhance-toptal-profile** all reference this file.
