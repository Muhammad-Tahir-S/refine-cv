---
name: scan-jobs
description: >-
  Run board-first job scan across public APIs/RSS (Himalayas, Jobicy, Remotive,
  Arbeitnow, Remote OK, WWR, HN Who is Hiring) for React frontend remote roles,
  dedupe against prior runs and applied jobs, optionally run low-volume LinkedIn
  discovery. Use for /scan-jobs or weekly job search.
---

# Scan Jobs

## Prerequisites

- Job board sources: `config/job-sources.json`
- Geo / role / blocklist: `config/job-search.json` (default React/frontend)
- Backend scan config: `config/job-search-nodejs-backend.json`
- Scan state (auto-created): `~/.config/refine-cv/scan-state.json` — v3 profile-aware seen maps (`reactFrontend`, `nodejsBackend`)
- Job lifecycle (auto-synced from report checkboxes): `~/.config/refine-cv/applied-jobs.json` — v2 schema with `applied`, `dismissed`, `expired` maps
- Criteria: React/frontend remote roles for a Nigerian applicant (`config/job-search.json`); Nigeria-eligible vs verify-geo vs likely-excluded geo tiers

## Workflow

### 1. Run board scan

```bash
pnpm scan-jobs
pnpm scan-jobs --config config/job-search-nodejs-backend.json
pnpm scan-jobs --config config/job-search.json --profile nodejsBackend
```

This:

1. Fetches all enabled boards in `config/job-sources.json` via public JSON/RSS APIs (no login)
2. Applies employer blocklist from `config/job-search.json`
3. Filters for React/frontend + Nigeria-focused geo eligibility (`src/lib/jobs/geo.ts`)
4. Merges applied checkboxes from prior `jobs/*-job-scan/report.md` files
5. Dedupes against scan state; reports **new** listings only
6. Writes `jobs/YYYY-MM-DD-job-scan/report.md` and `raw.json`

See `docs/job-board-sources.md` for source cadence and attribution rules.

### 2. Summarize for the user

Present:

- Count of new vs previously seen vs excluded
- Nigeria-eligible and verify-geo tables from the report (prioritize Nigeria-eligible)
- Per-source fetch stats and errors
- Path to the report and applied checklist

### 3. Optional — LinkedIn discovery (low volume)

Only if the user wants extra listings and accepts LinkedIn ToS risk:

```bash
pnpm linkedin:login    # once, or when session expires — user signs in manually
pnpm discover-linkedin # max 3 pages/day, external-apply URLs only
pnpm discover-linkedin --force  # bypass daily cap when testing fixes
```

**Browser:** LinkedIn scripts require **Google Chrome** (not Safari). Playwright launches Chrome via `channel: "chrome"`. For agent browser automation in Cursor, this repo configures Playwright MCP with `--browser chrome` in `.cursor/mcp.json` (Cursor's built-in Browser Tab uses embedded Chromium and cannot be switched to Chrome).

LinkedIn discovery uses **Voyager API interception** (search) plus lightweight **in-page detail fetches** for `applyMethod.companyApplyUrl` — no DOM scraping or Apply-button clicks.

If discovery reports **0 jobs extracted**, the session likely expired or Voyager API shape changed — re-run `pnpm linkedin:login`. Check `linkedin-discovery.md` for per-page counts and Easy Apply vs external apply split.

Review `jobs/YYYY-MM-DD-job-scan/linkedin-discovery.md` for external-apply listings (blocklist filtered). This is separate from the main board scan.

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
- Do not surface blocklisted employers from `config/job-search.json`
- Treat verify-geo listings as manual review only — many EMEA roles exclude Nigeria despite regional labels

## Handoff

For strong matches, offer `/tailor-cv` with the apply URL from the report.

## Future session boards

Session-required sources (Indeed, Glassdoor, Wellfound, etc.) are documented in `docs/session-job-boards-backlog.md` — not part of `pnpm scan-jobs`.
