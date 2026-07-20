# Public job board sources

Board-first scanning uses only public APIs and RSS feeds configured in `config/job-sources.json`. No login or browser session is required for these sources.

## Implemented sources

| Source | Endpoint / feed | Cadence | Attribution |
|--------|------------------|---------|-------------|
| Himalayas | `https://himalayas.app/jobs/api/search` | Daily | Link to Himalayas listing |
| Jobicy | `https://jobicy.com/api/v2/remote-jobs` | Every 6h | Credit Jobicy + direct job URL |
| Remotive | `https://remotive.com/api/remote-jobs` | 2–4× daily max | Credit Remotive + direct job URL |
| Arbeitnow | `https://www.arbeitnow.com/api/job-board-api` | Daily | Link back to Arbeitnow |
| Remote OK | `https://remoteok.com/api` | Daily | Link back to Remote OK (follow, no nofollow) |
| We Work Remotely | Category RSS feeds | Every 4–6h | Credit WWR + apply via WWR URL |
| HN Who is Hiring | Algolia HN API | Monthly (first weekday) | Link to HN thread/comment |

Remote OK listings pass through structural validation because the feed contains malformed or stale records. Metadata/header rows are skipped before record validation.

## Excluded for now

These boards were evaluated but not integrated because terms forbid automation, APIs are unstable, or permission is unclear:

- Remote.co — terms prohibit automated download/redistribution
- Wellfound / AngelList — login-only GraphQL
- YC Work at a Startup — terms prohibit scraping
- Jobgether — already blocklisted; no public feed rights
- Working Nomads — undocumented exposed feed; seek permission first
- Workbeam / Career Nest — live endpoints failed during validation

## Configuration

- Enable/disable boards in `config/job-sources.json`
- Employer blocklist lives in `config/job-search.json` (`blocklist` array)
- Search/geo criteria in `config/job-search.json` (default React/frontend) or `config/job-search-nodejs-backend.json` (Node.js/backend)
- Per-board query options support `profileOptions.reactFrontend` and `profileOptions.nodejsBackend`. Top-level `query`, `tag`, `search`, `category`, `tags`, and `feeds` remain as backward-compatible defaults when profile-specific overrides are absent.
- Remote OK sends multiple tags in its documented comma-separated form (for example, `?tags=nodejs,backend,dev`). WWR backend scans use its `back-end` category feed.
- Unsupported adapter options fail at config load with an actionable error.

## Adapter behavior

- Adapters normalize board payloads into `RawPosting` records and quarantine malformed rows without failing the whole source.
- Remote OK metadata/header objects (`legal`, metadata-only `last_updated`) are skipped; valid job rows are validated independently.
- Role eligibility is enforced by the shared scan policy, not inside individual adapters.
- Quarantine reason counts and bounded samples are retained on source stats for diagnostics.

## Polling guidance

Do not poll faster than each source's documented guidance. `config/job-sources.json` sets `minPollHours` per board; the scan enforces cadence independently per role profile using `~/.config/refine-cv/source-poll-state.json`. Cadence anchors on the latest valid attempt, success, or failure timestamp, so a slow request or retry sequence cannot shorten the interval. Use `pnpm scan-jobs --force` only when intentionally bypassing cadence (e.g. debugging). HTTP fetches use bounded timeouts, retries (408/429/5xx and transient network errors only), exponential backoff with jitter, and `Retry-After` honoring up to a cap.

When every enabled source is cadence-skipped, the report states that no fresh listing set was produced — it does not imply boards returned zero jobs. A run exits non-zero only when every **attempted** source fails (total source outage).

Each completed run writes three artifacts under `jobs/{runId}-job-scan/`:

| File | Purpose |
|------|---------|
| `report.md` | Human-readable tables, attribution, diagnostics |
| `scan-result.json` | Processed run results (policy matches, exclusions, stats) |
| `manifest.json` | Versioned run metadata: commit, config fingerprints, policy, per-source timings, quarantine, pipeline totals |

Older runs may still contain `raw.json` (pre-Phase 8 name for processed results). New runs use `scan-result.json`.

The scan runs enabled boards with bounded concurrency and continues if one source fails.
