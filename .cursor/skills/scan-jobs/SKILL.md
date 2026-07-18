---
name: scan-jobs
description: >-
  Run ATS-first job scan (Greenhouse/Lever/Ashby/Workable) for React frontend
  remote roles, dedupe against prior runs and applied jobs, optionally run
  low-volume LinkedIn discovery for new companies. Use for /scan-jobs or weekly job search.
---

# Scan Jobs

## Prerequisites

- Company registry: `config/companies.json`
- Geo / role criteria: `config/job-search.json`
- Scan state (auto-created): `~/.config/refine-cv/scan-state.json`
- Applied jobs (auto-synced from report checkboxes): `~/.config/refine-cv/applied-jobs.json`
- Criteria: React/frontend remote roles for a Nigerian applicant (`config/job-search.json`); Nigeria-eligible vs verify-geo vs likely-excluded geo tiers

## Workflow

### 1. Run ATS scan

```bash
pnpm scan-jobs
```

This:

1. Fetches all boards in `config/companies.json` via public ATS JSON APIs (custom careers HTML for non-ATS employers)
2. Filters for React/frontend + Nigeria-focused geo eligibility (`src/lib/jobs/geo.ts`)
3. Merges applied checkboxes from prior `jobs/*-job-scan/report.md` files
4. Dedupes against scan state; reports **new** listings only
5. Writes `jobs/YYYY-MM-DD-job-scan/report.md` and `raw.json`

### 2. Summarize for the user

Present:

- Count of new vs previously seen vs excluded
- Nigeria-eligible and verify-geo tables from the report (prioritize Nigeria-eligible)
- Fetch errors (if any) with company names
- Path to the report and applied checklist

### 3. Optional — LinkedIn discovery (low volume)

Only if the user wants new company names and accepts LinkedIn ToS risk:

```bash
pnpm linkedin:login    # once, or when session expires — user signs in manually
pnpm discover-linkedin # max 3 pages/day, external-apply URLs only
pnpm discover-linkedin --force  # bypass daily cap when testing fixes
```

**Browser:** LinkedIn scripts require **Google Chrome** (not Safari). Playwright launches Chrome via `channel: "chrome"`. For agent browser automation in Cursor, this repo configures Playwright MCP with `--browser chrome` in `.cursor/mcp.json` (Cursor's built-in Browser Tab uses embedded Chromium and cannot be switched to Chrome).

LinkedIn discovery uses **Voyager API interception** (search) plus lightweight **in-page detail fetches** for `applyMethod.companyApplyUrl` — no DOM scraping or Apply-button clicks.

If discovery reports **0 jobs extracted**, the session likely expired or Voyager API shape changed — re-run `pnpm linkedin:login`. Check `discovered-companies.md` for per-page counts and Easy Apply vs external apply split.

Review `jobs/YYYY-MM-DD-job-scan/discovered-companies.md` and propose additions to `config/companies.json` (user approves).

### 4. Applied tracking

User ticks `- [x]` on checklist items in the report after applying. Next `pnpm scan-jobs` auto-syncs them. Manual sync:

```bash
pnpm mark-applied
```

### 5. Weekly cadence

Suggest `/loop 7d /scan-jobs` (mirrors `docs/WEEKLY-REFRESH.md` for GitHub).

## Guardrails

- Do not paste LinkedIn cookies or tokens in chat
- Do not increase LinkedIn discovery volume beyond the script caps
- Do not add blocklisted employers from `config/companies.json` blocklist
- Treat verify-geo listings as manual review only — many EMEA roles exclude Nigeria despite regional labels

## Handoff

For strong matches, offer `/tailor-cv` with the company apply URL from the report.
