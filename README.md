# refine-cv

Private workflow for tailoring CVs and application prose to job descriptions. Uses **citable** ATS and recruiter best practices, a local profile (PDF + questionnaire), GitHub evidence from repos you choose, and Cursor agent skills for generation.

Built with **TypeScript** and **pnpm** (no Python or shell scripts).

**Keep this repository private** until git history is rewritten. Tip-of-tree no longer tracks CVs, questionnaires, job folders, or personal configs (`profile/*` except onboarding, `jobs/**`, `config/github-repos.json`, `config/job-search*.json` are gitignored). Older commits may still contain PII.

---

## Setup

| Requirement | Notes |
|-------------|-------|
| Node.js 20+ | `.nvmrc` pins v22 |
| pnpm | `npm install -g pnpm` |
| GitHub auth | `GITHUB_TOKEN` in `.env` **or** `gh auth login` |

```bash
nvm use          # optional
pnpm install

# First-time local config (gitignored — copy from tracked examples)
cp config/github-repos.example.json config/github-repos.json
cp config/job-search.example.json config/job-search.json
cp config/job-search-nodejs-backend.example.json config/job-search-nodejs-backend.json
cp .env.example .env   # optional — or use pnpm auth:github
# Edit config/job-search*.json applicant + geo fields. Geo matching in src/lib/jobs/geo.ts is Nigeria-focused.

pnpm setup:pdf   # optional — Chromium for PDF export (pnpm render-cv)
pnpm setup:linkedin  # optional — Chrome for LinkedIn discovery
pnpm build
pnpm validate    # check onboarding readiness
```

---

## How the repo is organized

| Layer | Role |
|-------|------|
| `src/bin/` | CLI scripts (extract, index, scan, render) |
| `profile/` | Your CV, questionnaire, GitHub index, Toptal snapshots |
| `config/` | GitHub repo list and search policy (local, gitignored); board registry (`job-sources.json`, tracked) |
| `sources/` | Writing authorities (CV, Toptal, anti-AI style) |
| `jobs/` | One folder per application or job-scan run |
| `.cursor/skills/` | Agent workflows |
| `.cursor/commands/` | Slash commands that invoke skills |
| `.cursor/rules/` | File-scoped guardrails loaded during edits |

**Generation model:** Prose is written by the Cursor agent following skills + rules + sources. CLI scripts handle extraction, indexing, scanning, and PDF rendering — not LLM calls.

---

## Features

Each feature lists its **lifecycle**, **Cursor commands**, **CLI scripts**, **outputs**, and **related side features**.

---

### 1. Profile onboarding

Build the evidence base every other feature depends on.

**Lifecycle**

```
base-cv.pdf
  → pnpm extract-cv          → profile/base-cv.md
  → pnpm list-repos          → profile/github-repo-candidates.md
  → edit config/github-repos.json
  → pnpm index-github        → profile/github-index.json + github-summary.md
  → agent onboard            → profile/questionnaire.md
                             → profile/base-cv-enhanced.md + gap-report.md
  → pnpm validate            → readiness check
```

**Cursor**

| Command | Skill | What it does |
|---------|-------|--------------|
| *(ask agent to onboard)* | `onboard-profile` | Questionnaire gaps, enhanced CV, gap report |
| `/refresh-github-profile` | `refresh-github-profile` | Re-index repos (see feature 6) |

**Scripts**

| Script | Purpose |
|--------|---------|
| `pnpm extract-cv` | PDF → `profile/base-cv.md` |
| `pnpm list-repos` | Repos you pushed to (~10 years) → candidates file |
| `pnpm index-github` | Index selected repos → index + summary |
| `pnpm validate` | Check files, skills, token, index state |

**Outputs**

- `profile/base-cv-enhanced.md` — canonical facts for tailoring
- `profile/gap-report.md` — unsupported claims to confirm
- `profile/questionnaire.md` — metrics, red lines, writing voice

**Side features**

- `profile/ONBOARDING.md` — step-by-step walkthrough
- `docs/WEEKLY-REFRESH.md` — keep GitHub evidence current after first index

---

### 2. CV tailoring

Tailor your CV to a specific job description with keyword mapping and match reporting.

**Lifecycle**

```
Paste JD in chat → /tailor-cv
  → jobs/YYYY-MM-DD-company-role/job-description.md
  → keyword map + grep profile/github-index.json (see sources/evidence-hierarchy.md)
  → jobs/…/match-report.md       (Index search log + keyword table + Style pass)
  → jobs/…/tailored-cv.md        (bullets from merged PRs, not CV paraphrase)
  → optional cover-letter-hooks.md / cover-letter.md
  → pnpm render-cv jobs/…/tailored-cv.md  → tailored-cv.pdf
  → optional /avoid-ai-writing   (deep audit before send)
```

**Cursor**

| Command | Skill | Rules |
|---------|-------|-------|
| `/tailor-cv` | `tailor-cv` | `cv-writing`, `writing-style` |

**Scripts**

| Script | Purpose |
|--------|---------|
| `pnpm render-cv <path>` | Markdown CV → ATS-friendly PDF |
| `pnpm setup:pdf` | Install Chromium for Puppeteer (required for `pnpm render-cv`) |

**Outputs** (under `jobs/YYYY-MM-DD-company-role/`)

| File | Purpose |
|------|---------|
| `tailored-cv.md` | JD-aligned CV (Markdown) |
| `tailored-cv.pdf` | Export for applications |
| `match-report.md` | Index search log, keyword coverage, risks, ATS checklist, **Style pass** |
| `cover-letter-hooks.md` | Optional 3–5 factual bullets |
| `cover-letter.md` | Optional full letter (first person) |

**Authorities**

- `sources/evidence-hierarchy.md` — **index-first tailoring**; grep `github-index.json` before prose; CV whiffing is a hard fail
- `sources/cv-best-practices.md` — ATS and career-center rules
- `sources/writing-style.md` — anti-AI rules at draft time (see feature 3)

**Side features**

- Evidence tags: `verified-from-github` vs `needs-your-confirmation` in `github-summary.md`
- Red lines in `questionnaire.md` (never invent employers, metrics, or proprietary details)
- PDF template: `templates/cv/resume.css` (single column, selectable text)

---

### 3. Anti-AI writing

Two layers keep generated prose from reading like LLM output.

**Lifecycle**

```
Generation (tailor-cv, toptal-pitch, etc.)
  → sources/writing-style.md     mandatory polish pass (em dashes, contrast clichés, Tier-1 words)
  → profile/questionnaire.md     § Writing voice (personal overrides)
  → Style pass logged in match-report.md

Pre-send (high-stakes applications)
  → /avoid-ai-writing            deep audit (53 categories, P0/P1/P2 severity)
     modes: rewrite | detect | edit
     voices: casual | professional | technical | warm | blunt
```

**Cursor**

| Command | Skill | Rules |
|---------|-------|-------|
| `/avoid-ai-writing` | `avoid-ai-writing` | `avoid-ai-writing`, `writing-style` |

**Scripts**

*None.* This feature is agent-only.

**What each layer covers**

| Layer | File | Scope |
|-------|------|-------|
| Draft-time | `sources/writing-style.md` | Job-application P0/P1: zero em dashes, no `not just X`, Tier-1 vocabulary, chatbot artifacts |
| Deep audit | `.cursor/skills/avoid-ai-writing/SKILL.md` | Full catalog: 109-word tier table, 53 pattern categories, rhythm/uniformity, social/blog patterns |

**Upstream skill**

Vendored from [conorbronsdon/avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing) v3.15.0 (MIT). Re-sync:

```bash
curl -fsSL -o .cursor/skills/avoid-ai-writing/SKILL.md \
  https://raw.githubusercontent.com/conorbronsdon/avoid-ai-writing/main/SKILL.md
curl -fsSL -o .cursor/rules/avoid-ai-writing.mdc \
  https://raw.githubusercontent.com/conorbronsdon/avoid-ai-writing/main/cursor-rules/avoid-ai-writing.mdc
```

**Trigger phrases**

- "Remove AI-isms from this cover letter"
- "Audit this draft for AI tells" (detect mode)
- "Edit `jobs/…/pitch.md` in place" (edit mode)

**Side features**

- `writing-style.mdc` — activates on `jobs/**`, `profile/**`
- `avoid-ai-writing.mdc` — activates on `**/*.md`, `**/*.txt`
- All text-gen skills reference `writing-style.md` in prerequisites

---

### 4. Toptal application pitch

Generate a third-person pitch for a specific Toptal job posting.

**Lifecycle**

```
Paste Toptal JD → /toptal-pitch
  → jobs/…/job-description.md
  → pitch doctrine gate (handbook §10–12)
  → jobs/…/pitch.md              (plain text paste blocks, writing-style polish)
  → jobs/…/pitch-match-report.md (doctrine coverage + Style pass)
  → optional /avoid-ai-writing
```

**Cursor**

| Command | Skill | Rules |
|---------|-------|-------|
| `/toptal-pitch` | `generate-toptal-pitch` | `toptal-writing`, `writing-style` |

**Scripts**

| Script | Purpose |
|--------|---------|
| `pnpm extract-toptal-guides` | Re-extract handbook raw text from PDF (maintenance) |

**Outputs**

- `pitch.md` — ~500-character main paragraph + optional project URLs (plain text, no markdown in paste blocks)
- `pitch-match-report.md` — keyword coverage, gaps, §7 checklist, Style pass

**Authorities**

- `sources/toptal-guides/job-application-matching-handbook.md` — pitch basis §10–12
- `sources/toptal-best-practices.md` — doctrine §3, checklist §7

**Side features**

- Third person only (no I/my/me)
- Run `/tailor-cv` separately if you also need a CV PDF for the same role

---

### 5. Toptal profile enhancement

Improve your baseline Toptal platform profile (not per-job).

**Lifecycle**

```
Paste current Toptal profile → /enhance-toptal-profile
  → profile/toptal-profile-current.md   (snapshot)
  → profile/toptal-profile-enhanced.md  (sectioned paste blocks)
  → profile/toptal-profile-gap-report.md (gaps + Style pass)
  → optional /avoid-ai-writing
  → user pastes sections into Toptal manually
```

**Cursor**

| Command | Skill | Rules |
|---------|-------|-------|
| `/enhance-toptal-profile` | `enhance-toptal-profile` | `toptal-writing`, `writing-style` |

**Scripts**

*None.*

**Authorities**

- `sources/toptal-guides/developer-profile-creation-guide.md`
- `sources/toptal-best-practices.md` — profile §2, checklist §8

**Side features**

- Minimum 5 portfolio projects with links and stack tags
- Skills rated Competent / Strong / Expert with evidence
- JD-specific retagging is **not** in scope — use `/toptal-pitch` per job

---

### 6. Job scanning

Find new React frontend remote roles from public job boards; optionally run low-volume LinkedIn discovery.

**Lifecycle**

```
pnpm scan-jobs
  → enforce minPollHours cadence (source-poll-state.json) unless --force
  → fetch enabled boards in config/job-sources.json (Himalayas, Jobicy, Remotive, etc.)
  → apply employer blocklist from config/job-search.json
  → filter: React/FE, remote scope, seniority
  → dedupe vs profile-specific ~/.config/refine-cv/scan-state.json (v3)
  → sync applied checkboxes into lifecycle state (applied-jobs.json v2)
  → publish jobs/{UTC}-{role-profile}-job-scan-{suffix}/report.md + scan-result.json + manifest.json (atomic staging rename)
  → update jobs/.latest-{role-profile}-job-scan.json pointer

Optional discovery:
  pnpm linkedin:login        (once — manual sign-in in Chrome)
  pnpm discover-linkedin     (max 3 pages/day, external-apply URLs)
  → jobs/…/linkedin-discovery.md

After applying:
  tick - [x] in report checklist → next scan auto-syncs
  or pnpm mark-applied
```

**Cursor**

| Command | Skill |
|---------|-------|
| `/scan-jobs` | `scan-jobs` |

**Scripts**

| Script | Purpose |
|--------|---------|
| `pnpm scan-jobs` | Board scan → report + raw JSON |
| `pnpm scan-jobs --force` | Bypass per-source minPollHours cadence |
| `pnpm scan-jobs --config config/job-search-nodejs-backend.json` | Backend/Node.js board scan |
| `pnpm test` | Job scan unit tests (Vitest) |
| `pnpm mark-applied` | Sync applied checkboxes to state file |
| `pnpm linkedin:login` | Save LinkedIn session (Chrome via Playwright) |
| `pnpm discover-linkedin` | Low-volume LinkedIn external-apply discovery |
| `pnpm setup:linkedin` | Install Playwright Chrome |

**Config**

- `config/job-sources.json` — enabled public job boards
- `config/job-search.json` — geo criteria, role filters, employer blocklist (default React/frontend scan)
- `config/job-search-nodejs-backend.json` — Node.js/backend profile with junior/mid levels

**State** (auto-created, outside repo)

- `~/.config/refine-cv/scan-state.json` — profile-aware seen job IDs (v3: `reactFrontend` / `nodejsBackend` maps)
- `~/.config/refine-cv/source-poll-state.json` — profile-aware per-board poll cadence (v2: attempt/success/failure timestamps)
- `~/.config/refine-cv/applied-jobs.json` — job lifecycle state (v2: `applied`, `dismissed`, `expired`)
- `~/.config/refine-cv/job-scan.lock` — exclusive scan lock (auto-created; stale inactive locks are recovered)
- `jobs/.latest-{role-profile}-job-scan.json` — pointer to the newest completed board scan for that profile

**Side features**

- Weekly cadence: `/loop 7d /scan-jobs`
- LinkedIn uses Voyager API interception (`.cursor/mcp.json` configures Playwright MCP with Chrome)
- Re-verify geo restrictions before recommending EMEA roles for Nigeria-based applicants

---

### 7. GitHub evidence refresh

Keep commit/PR metadata current so tailoring uses recent proof.

**Lifecycle**

```
First: complete onboarding index (feature 1)

Weekly:
  /loop 7d /refresh-github-profile
    → pnpm index-github (incremental merge into v4 snapshot)
    → profile/github-index.json
    → profile/github-delta.json
    → profile/github-summary.md
    → profile/refresh-log.md append

Manual anytime:
  pnpm index-github
  or /refresh-github-profile
```

**Cursor**

| Command | Skill |
|---------|-------|
| `/refresh-github-profile` | `refresh-github-profile` |

**Scripts**

| Script | Purpose |
|--------|---------|
| `pnpm index-github` | Re-index selected repos |
| `pnpm list-repos` | Discover new repos to add to config |

**Side features**

- `profile/index-state.json` — incremental watermarks (advanced only after durable artifact writes)
- `profile/github-delta.json` — explicit per-run added/updated commit SHAs and PR numbers
- Review `needs-your-confirmation` bullets before adding to CV
- See `docs/WEEKLY-REFRESH.md`

---

## All Cursor commands

| Command | Feature |
|---------|---------|
| `/tailor-cv` | CV tailoring |
| `/generate-cover-letter` | Cover letter from JD |
| `/toptal-pitch` | Toptal pitch |
| `/enhance-toptal-profile` | Toptal profile |
| `/avoid-ai-writing` | Anti-AI deep audit |
| `/scan-jobs` | Job scanning |
| `/refresh-github-profile` | GitHub refresh |

**Recurring loops** (after first successful run):

```
/loop 7d /refresh-github-profile
/loop 7d /scan-jobs
```

---

## All CLI scripts

| Script | Feature |
|--------|---------|
| `pnpm extract-cv` | Onboarding |
| `pnpm list-repos` | Onboarding / GitHub refresh |
| `pnpm index-github` | Onboarding / GitHub refresh |
| `pnpm validate` | Onboarding / health check |
| `pnpm render-cv` | CV tailoring (PDF) |
| `pnpm scan-jobs` | Job scanning |
| `pnpm mark-applied` | Job scanning (applied sync) |
| `pnpm linkedin:login` | Job scanning (LinkedIn discovery) |
| `pnpm discover-linkedin` | Job scanning (LinkedIn discovery) |
| `pnpm extract-toptal-guides` | Toptal maintenance |
| `pnpm setup:pdf` | PDF Chromium install |
| `pnpm setup:linkedin` | Playwright Chrome install |
| `pnpm auth:github` | GitHub CLI login |
| `pnpm typecheck` | Dev |
| `pnpm typecheck:tests` | Dev (typecheck test + script sources) |
| `pnpm check:release` | Dev (scan tracked files for secrets) |
| `pnpm build` | Dev |

---

## Typical application workflow

```
1. /scan-jobs                          → pick a role from report
2. /tailor-cv + paste JD               → tailored-cv.md + match-report.md
3. Ask for cover-letter.md             → optional, first person
4. /avoid-ai-writing detect on letter  → pre-send audit
5. pnpm render-cv jobs/…/tailored-cv.md
6. Tick applied in report              → pnpm scan-jobs syncs next run
```

For Toptal: replace steps 2–4 with `/toptal-pitch` (+ optional `/avoid-ai-writing` on `pitch.md`).

---

## Directory reference

| Path | Purpose |
|------|---------|
| `profile/base-cv.pdf` | Canonical CV PDF |
| `profile/base-cv-enhanced.md` | Enhanced base for tailoring |
| `profile/questionnaire.md` | Metrics, red lines, writing voice |
| `profile/github-summary.md` | Indexed evidence summary |
| `config/github-repos.example.json` | Template → copy to `config/github-repos.json` (gitignored) |
| `config/job-search.example.json` | Template → copy to `config/job-search.json` (gitignored) |
| `config/job-sources.json` | Job scan board registry |
| `docs/job-board-sources.md` | Public board cadence and attribution |
| `docs/session-job-boards-backlog.md` | Future session-required boards |
| `sources/cv-best-practices.md` | CV/ATS rules |
| `sources/toptal-best-practices.md` | Toptal rules |
| `sources/writing-style.md` | Anti-AI rules (draft time) |
| `sources/toptal-guides/` | Official Toptal PDF extracts |
| `jobs/` | Per-application and scan outputs |
| `.cursor/skills/` | Agent workflows |
| `templates/cv/resume.css` | PDF print stylesheet |

---

## GitHub authentication

Create `.env` (gitignored):

```bash
GITHUB_TOKEN=ghp_...
```

Or:

```bash
pnpm auth:github
```

`pnpm list-repos` and `pnpm index-github` use `gh auth token` automatically when `GITHUB_TOKEN` is unset.

---

## Privacy

Private and employer repos are indexed for **metadata only** (commit subjects, PR titles, languages). Tailored outputs must **not** include proprietary source code. See `profile/questionnaire.md` red lines.

**Gitignored by default (local only):**

- `profile/*` except `profile/ONBOARDING.md` — CV, questionnaire, GitHub index, Toptal snapshots
- `config/github-repos.json`, `config/job-search.json`, `config/job-search-nodejs-backend.json` — your repos and geo criteria
- `jobs/**` except `jobs/.gitkeep` — job descriptions, tailored CVs, pitches, cover letters, scan reports
- `.env` and token files

Copy tracked `*.example.json` templates on first setup (see Setup above). CI runs `pnpm check:release` to fail if secrets or personal paths are tracked.

**Going public:** tip-of-tree is scrubbed, but **git history still contains PII** (CVs, indexes, job scans). Before making the repo public, rewrite history (for example `git filter-repo`) to drop `profile/`, `jobs/`, and former personal config blobs, then force-push only with an explicit plan and backup. Until then, keep the repository private.
