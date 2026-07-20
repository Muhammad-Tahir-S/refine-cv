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

Remote OK listings pass through extra validation because the feed contains malformed or stale records.

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

## Polling guidance

Do not poll faster than each source’s documented guidance. The scan runs all enabled boards with bounded concurrency and continues if one source fails.
