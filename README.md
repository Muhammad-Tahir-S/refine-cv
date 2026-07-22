# refine-cv

CV tailoring workflow with **citable** ATS best practices, local profile evidence, and optional GitHub indexing — built as modular **feature packs** for Cursor.

TypeScript + pnpm. No Python.

## Contents

- [How it works](#how-it-works)
- [Privacy first](#privacy-first)
- [Prerequisites](#prerequisites)
- [5-minute quickstart](#5-minute-quickstart)
- [The setup wizard](#the-setup-wizard)
- [Feature packs](#feature-packs)
- [Cursor commands (agent workflows)](#cursor-commands-agent-workflows)
- [CLI reference](#cli-reference)
- [Directory layout](#directory-layout)
- [Data files reference](#data-files-reference)
- [Everyday workflows](#everyday-workflows)
- [GitHub authentication](#github-authentication)
- [Toptal pack — bring your own PDFs](#toptal-pack--bring-your-own-pdfs)
- [Updating tooling](#updating-tooling)
- [Troubleshooting](#troubleshooting)

## How it works

1. **You provide evidence**: your master CV (PDF or pasted text), a short questionnaire, and optionally your GitHub history.
2. **`pnpm setup`** handles the mechanical steps: pack selection, CV extraction, GitHub auth + repo picking + indexing.
3. **The Cursor agent** handles the judgment steps: filling questionnaire gaps (`/onboard`), producing an enhanced base CV and gap report, then tailoring per job (`/tailor-cv`) or generating Toptal pitches (`/toptal-pitch`).
4. Every claim in generated output traces back to your evidence files — the writing rules forbid inventing employers, dates, metrics, or technologies, and unsupported items land in a gap report instead of your CV.

Agent behavior is packaged as **feature packs**. Canonical skills/commands/rules live in `packs/<name>/cursor/`; `pnpm setup` copies only the packs you selected into `.cursor/`, so the agent never sees (or suggests) workflows you didn't install.

## Privacy first

**Keep your copy private.** This repo is designed so personal data stays local:

- `profile/` and `config/` use **gitignore allowlists**: everything is ignored except `profile/ONBOARDING.md`, `profile/questionnaire.example.md`, and `config/*.example.json`. New files you (or the tools) drop there are ignored by default.
- `jobs/` (per-application drafts, scan reports) and user-supplied Toptal PDFs/extracts are also gitignored (`jobs/.gitkeep` is tracked).
- Use a **private** GitHub repository.
- Private GitHub repos are indexed for **metadata only** (commit subjects, PR titles) — never paste proprietary code into outputs.
- **Git history warning:** gitignore only protects future commits. If personal files were ever committed to your copy, they remain in git history — before making a repo public or turning it into a template, start from a fresh history rather than relying on deletions.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ (`.nvmrc` pins v22)
- [pnpm](https://pnpm.io/): `npm install -g pnpm`
- [Cursor](https://cursor.com/) (v1 targets Cursor's `.cursor/` skills/commands/rules)
- Optional, for the github-evidence pack: a `GITHUB_TOKEN` in `.env` or the [GitHub CLI](https://cli.github.com/) (`gh`)
- Optional, for the tailor-cv pack: ~170 MB disk for a Puppeteer-managed Chrome (PDF rendering; installed by the wizard, not on `pnpm install`)
- Optional, for the job-scan pack: Chrome for LinkedIn discovery (`pnpm setup:linkedin`)

## 5-minute quickstart

```bash
pnpm install
pnpm setup
```

Follow the wizard (details below), then open Cursor chat and run `/onboard`. After onboarding, tailor per application with `/tailor-cv`.

Check readiness anytime:

```bash
pnpm validate
```

## The setup wizard

`pnpm setup` is the single entry point for all mechanical setup. It is safe to re-run at any time — completed steps are detected and skipped, and your answers accumulate in `config/refine-cv.json`. Press `Ctrl+C` to cancel cleanly at any prompt.

### Step 1 — Feature selection

Checkbox picker of the packs below. Core is always installed; the recommended packs are pre-checked on first run, and your current selection is pre-checked on re-runs. The wizard then syncs `.cursor/` from `packs/` and seeds `profile/questionnaire.md` from the example template if missing.

Anything you added to `.cursor/` yourself (custom skills, commands, rules) is left untouched by the sync — only pack-owned files are overwritten.

### Step 2 — PDF renderer (tailor-cv pack only)

Offers to install the Chrome build Puppeteer needs for `pnpm render-cv` (~170 MB, skipped instantly if already cached). Decline and run `pnpm setup:pdf` later if you prefer.

### Step 3 — Toptal guides (toptal pack only)

Checks for the two official Toptal PDFs in `sources/toptal-guides/pdf/` (exact filenames listed in the warning and [below](#toptal-pack--bring-your-own-pdfs)). If present, offers to run the extraction; if absent, the pack installs in **degraded mode** — Toptal skills fall back to `sources/toptal-best-practices.md` until you add the PDFs.

### Step 4 — CV intake

Three options:

- **Path to a PDF** — copied to `profile/base-cv.pdf`, extracted to `profile/base-cv.md`, preview shown for confirmation
- **Paste text** — opens your `$EDITOR`; the pasted text is written to `profile/base-cv.md` (no PDF needed)
- **Skip** — add `profile/base-cv.pdf` later and run `pnpm extract-cv`

### Step 5 — GitHub connect (github-evidence pack only)

- **Auth**: uses an existing token if found (`GITHUB_TOKEN` env, `.env`, or `gh auth token`); otherwise offers to run `gh auth login` right there, or to skip
- **Repo picker**: fetches every repo you've pushed to in the last 10 years (owned, contributed, private if the token allows) and presents an interactive checkbox list; selections are written to `config/github-repos.json`
- **Index**: offers to run `pnpm index-github` immediately; if indexing fails (network, rate limit), your selection is saved and you can re-run `pnpm index-github` alone

### Step 6 — Handoff and validation

Prints your next steps (which depend on installed packs) and runs `pnpm validate`. Warnings about `/onboard` outputs are expected until you complete agent onboarding.

### Wizard flags

| Invocation | Behavior |
|------------|----------|
| `pnpm setup` | Full interactive wizard |
| `pnpm setup --yes` | Non-interactive: keeps current pack selection (or defaults + recommended on first run), re-syncs `.cursor/`, extracts CV if `profile/base-cv.pdf` exists, **never** guesses repo selections |
| `pnpm setup --add <pack>` | Install one pack and sync `.cursor/` (installs Chrome when adding tailor-cv) |
| `pnpm setup --remove <pack>` | Uninstall one pack and remove its `.cursor/` assets (core cannot be removed) |

## Feature packs

| Pack | What it adds | Default |
|------|--------------|---------|
| **core** | Onboarding, CV extraction, questionnaire, writing rules, anti-AI audit | Always |
| **github-evidence** | Repo indexing, weekly refresh skill | Recommended |
| **tailor-cv** | JD tailoring, cover letters, match reports, PDF export | Recommended |
| **job-scan** | Public board scan, applied-job tracking, optional LinkedIn discovery | Recommended |
| **toptal** | Profile enhancement + job pitches (BYO PDF guides) | Opt-in |

Packs are defined in [`packs.json`](packs.json) (the single source of truth — `pnpm validate` checks assets straight from it). Canonical pack assets live in `packs/<name>/cursor/`; `pnpm setup` copies selected packs into `.cursor/`. See [docs/PACKS.md](docs/PACKS.md) for per-pack details and how to add a custom pack.

Installed packs are recorded in `config/refine-cv.json` (gitignored).

## Cursor commands (agent workflows)

Available commands depend on installed packs:

| Command | Pack | What the agent does |
|---------|------|---------------------|
| `/onboard` | core | Asks only the questionnaire gaps not answerable from your CV/GitHub, writes `profile/questionnaire.md`, `profile/base-cv-enhanced.md` (stronger bullets, same facts), and `profile/gap-report.md` |
| `/avoid-ai-writing` | core | Deep audit or rewrite to remove AI writing patterns before sending |
| `/tailor-cv` | tailor-cv | Paste a JD → `jobs/YYYY-MM-DD-company-role/` with `tailored-cv.md`, `match-report.md`, optional cover-letter hooks, and a rendered PDF |
| `/generate-cover-letter` | tailor-cv | Paste a JD → `cover-letter.md` with index-first evidence and anti-AI double-check |
| `/scan-jobs` | job-scan | Run board-first job scan and report new React frontend remote roles |
| `/toptal-pitch` | toptal | Paste a Toptal JD → third-person application pitch + pitch match report |
| `/enhance-toptal-profile` | toptal | Paste your current Toptal profile → enhanced bio/skills/portfolio + gap report |
| `/refresh-github-profile` | github-evidence | Re-runs the index, summarizes deltas, appends to `profile/refresh-log.md` |

Weekly refresh loop (after the first successful index): `/loop 7d /refresh-github-profile` — see [docs/WEEKLY-REFRESH.md](docs/WEEKLY-REFRESH.md).

Job scan loop: `/loop 7d /scan-jobs` — see [docs/job-board-sources.md](docs/job-board-sources.md).

## CLI reference

All scripts build first, so they always run current code.

| Command | Pack | Description |
|---------|------|-------------|
| `pnpm setup [--yes] [--add <pack>] [--remove <pack>]` | — | Setup wizard (see [flags](#wizard-flags)) |
| `pnpm validate` | core | Pack-aware readiness check; exits non-zero on failures (warnings are informational) |
| `pnpm extract-cv` | core | `profile/base-cv.pdf` → `profile/base-cv.md` |
| `pnpm list-repos [-u <login>] [-y <years>] [--public-only]` | github-evidence | Discover candidate repos → `profile/github-repo-candidates.md` |
| `pnpm index-github` | github-evidence | Incrementally index repos from `config/github-repos.json` → `profile/github-index.json` + `profile/github-summary.md` |
| `pnpm render-cv <input.md> [-o out.pdf]` | tailor-cv | Markdown CV → ATS-friendly PDF |
| `pnpm setup:pdf` | tailor-cv | Install the Puppeteer-managed Chrome (idempotent) |
| `pnpm scan-jobs [--force] [--config …]` | job-scan | Board scan → report + raw JSON |
| `pnpm mark-applied` | job-scan | Sync applied checkboxes to state file |
| `pnpm linkedin:login` | job-scan | Save LinkedIn session (Chrome via Playwright) |
| `pnpm discover-linkedin` | job-scan | Low-volume LinkedIn external-apply discovery |
| `pnpm setup:linkedin` | job-scan | Install Playwright Chrome |
| `pnpm extract-toptal-guides [--force]` | toptal | Extract user-supplied PDFs → structured markdown (`--force` overwrites existing extracts) |
| `pnpm auth:github` | github-evidence | Shortcut for `gh auth login` |
| `pnpm test` | — | Unit tests (Vitest) |
| `pnpm check:release` | — | Scan tracked files for secrets / PII |
| `pnpm typecheck` / `pnpm build` | — | TypeScript check / compile to `dist/` |

## Directory layout

| Path | Purpose | Committed? |
|------|---------|-----------|
| `packs/` | Canonical pack assets (skills, commands, rules) — edit here | Yes |
| `packs.json` | Pack manifest: assets, sources, scripts per pack | Yes |
| `src/` | CLI tooling (TypeScript) | Yes |
| `sources/` | Citable writing rules and reference extracts | Yes (except Toptal extracts) |
| `templates/cv/` | PDF rendering template (CSS) | Yes |
| `docs/` | Per-topic docs | Yes |
| `.cursor/` | Synced from `packs/` by setup — agent reads from here | No (regenerated) |
| `profile/` | Your CV, questionnaire, GitHub index | No (allowlisted examples only) |
| `config/` | Repo selection + installed-pack state | No (allowlisted examples only) |
| `jobs/` | Per-application outputs | No |

## Data files reference

Files created and maintained on your machine (all gitignored):

| File | Written by | Contents |
|------|-----------|----------|
| `config/refine-cv.json` | `pnpm setup` | Installed packs, setup progress flags (`cvIntakeCompleted`, `githubConnectCompleted`) |
| `config/github-repos.json` | setup wizard (or by hand from the example) | GitHub username, repos to index, indexing options |
| `config/job-search.json` | copied from example on first setup | Geo criteria, role filters, employer blocklist |
| `config/job-search-nodejs-backend.json` | copied from example (optional) | Backend/Node.js scan profile |
| `profile/base-cv.pdf` | you (via wizard) | Master CV PDF |
| `profile/base-cv.md` | `pnpm extract-cv` or pasted-text intake | Extracted CV text (header marker identifies real extracts) |
| `profile/questionnaire.md` | seeded by setup, filled by `/onboard` | Targeting, metrics, red lines, preferences |
| `profile/base-cv-enhanced.md` | `/onboard` | Enhanced base CV — the source for all tailoring |
| `profile/gap-report.md` | `/onboard` | Unsupported/missing claims that need your input |
| `profile/github-index.json` | `pnpm index-github` | Raw commit/PR metadata per repo |
| `profile/github-summary.md` | `pnpm index-github` | Human-readable evidence summary with draft bullets |
| `profile/index-state.json` | `pnpm index-github` | Incremental-index watermarks |
| `profile/github-repo-candidates.md` | `pnpm list-repos` | Discovered repos for selection |
| `profile/refresh-log.md` | `/refresh-github-profile` | One row per refresh run |
| `profile/toptal-profile-*.md` | `/enhance-toptal-profile` | Toptal profile snapshot, enhanced version, gap report |
| `jobs/YYYY-MM-DD-company-role/` | `/tailor-cv`, `/toptal-pitch`, `/generate-cover-letter` | Per-application outputs |
| `jobs/{UTC}-{role}-job-scan-*/` | `pnpm scan-jobs` | Scan reports and raw JSON |

## Everyday workflows

### First-time onboarding

1. `pnpm install && pnpm setup`
2. In Cursor chat: `/onboard` — answer the questionnaire gaps; review `profile/gap-report.md`
3. `pnpm validate` — expect all OK (Toptal snapshot warning is fine until you use that pack)

### Per job application

1. `/tailor-cv`, paste the job description
2. Review `jobs/<date-company-role>/match-report.md` — especially any `needs-your-confirmation` items
3. The agent renders the PDF via `pnpm render-cv`; check it before sending

### Toptal

- `/enhance-toptal-profile` with your current profile pasted — apply the top changes on Toptal
- `/toptal-pitch` per job application

### Job scanning (job-scan pack)

1. Copy `config/job-search*.example.json` to gitignored paths (see [profile/ONBOARDING.md](profile/ONBOARDING.md))
2. `pnpm scan-jobs` or `/scan-jobs` in Cursor
3. Pick roles from the report; run `/tailor-cv` or `/generate-cover-letter` per listing
4. Tick applied in the report checklist — the next scan auto-syncs

### Keeping GitHub evidence fresh

- One-off: `/refresh-github-profile` or `pnpm index-github`
- Recurring: `/loop 7d /refresh-github-profile` (see [docs/WEEKLY-REFRESH.md](docs/WEEKLY-REFRESH.md))

## GitHub authentication

Token resolution order (used by all GitHub tooling): `GITHUB_TOKEN` environment variable → `GITHUB_TOKEN=` line in `.env` → `gh auth token`.

Options:

- **GitHub CLI (recommended):** `gh auth login` — the wizard can run this for you
- **Personal access token:** create a token with `repo` read scope, put `GITHUB_TOKEN=ghp_...` in `.env` (gitignored)
- **No auth:** `pnpm list-repos --public-only` works without a token but misses private/contributed repos

## Toptal pack — bring your own PDFs

The Toptal pack ships **extraction tooling only** — the official guides are not redistributed. Drop your own copies into `sources/toptal-guides/pdf/` with these **exact filenames**:

- `Job Application Matching Process Handbook for Developers.pdf`
- `Developer - Profile Creation Guide.pdf`

Then run:

```bash
pnpm extract-toptal-guides
```

Without the PDFs the pack works in **degraded mode**: skills fall back to `sources/toptal-best-practices.md` and note the reduced basis in their outputs. PDFs and extracts are gitignored. See [sources/toptal-guides/README.md](sources/toptal-guides/README.md).

## Updating tooling

Pull upstream template/tooling changes without touching user data (all user data lives in gitignored paths):

```bash
git pull origin main
pnpm install
pnpm setup --yes   # re-sync .cursor/ from packs/
```

If you customized skills inside `packs/`, review diffs before syncing — pack-owned files in `.cursor/` are overwritten on sync (your own additions to `.cursor/` are preserved).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `/onboard` (or another command) missing in Cursor | The pack isn't installed or `.cursor/` isn't synced — run `pnpm setup` (or `pnpm setup --yes`) |
| `pnpm validate` fails with missing skill/command/rule | Same as above: re-run `pnpm setup --yes` |
| `render-cv` errors about a missing browser | `pnpm setup:pdf` |
| Wizard says Toptal PDFs missing but you added them | Filenames must match exactly — see [BYO PDFs](#toptal-pack--bring-your-own-pdfs) |
| CV extraction looks garbled | PDF text layers vary; choose "Paste text" in the wizard's CV intake instead, or hand-edit `profile/base-cv.md` |
| `index-github` fails (rate limit/network) | Repo selection is already saved — just re-run `pnpm index-github` |
| `gh auth login` unavailable | Install the [GitHub CLI](https://cli.github.com/) or use a `GITHUB_TOKEN` in `.env` |
| Private repos missing from the repo picker | Your token lacks `repo` scope, or you used `--public-only` |
| Accidentally edited `.cursor/` skills | Edits to pack-owned files are lost on next sync — make the change in `packs/<name>/cursor/` instead |
| Want to start over | Delete `config/refine-cv.json` and re-run `pnpm setup` (your profile data is untouched) |

## Onboarding reference

See [profile/ONBOARDING.md](profile/ONBOARDING.md) for the condensed two-step guide (mechanical: `pnpm setup`; agent: `/onboard`).
