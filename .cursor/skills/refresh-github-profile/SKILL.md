---
name: refresh-github-profile
description: >-
  Re-index selected GitHub repos, update github-index.json and github-summary.md,
  and append refresh-log.md. Use for /refresh-github-profile or weekly /loop refresh.
---

# Refresh GitHub profile

## Prerequisites

- `pnpm install` completed
- `GITHUB_TOKEN` in `.env` or `gh auth login` with read access to all repos in `config/github-repos.json`
- Repos listed in [config/github-repos.json](../../../config/github-repos.json)

## Steps

1. Read `config/github-repos.json` and confirm repo list with user if empty or stale.
2. Run from repo root:

```bash
pnpm index-github
```

3. On success, read outputs:
   - `profile/github-index.json` (v4 complete evidence snapshot)
   - `profile/github-delta.json` (this run's delta only)
   - `profile/github-summary.md`
   - `profile/index-state.json` (watermarks; advanced only after durable writes)
   - `profile/refresh-log.md` (latest row)

4. Summarize **delta** for the user from `github-delta.json`: added/updated commits and PRs, repos failed (prior evidence retained), new themes.

5. If `base-cv-enhanced.md` exists, suggest bullet updates only where GitHub evidence newly supports claims; do not auto-edit enhanced CV without user approval.

## Incremental behavior

- Per repo: full history when `maxCommitsPerRepo` is `0` (default); all your PRs when `maxPullRequestsPerRepo` is `0`
- Later runs: incremental fetch with overlap around `profile/index-state.json` watermarks; merges into durable v4 snapshot in `github-index.json`
- Explicit per-run delta in `profile/github-delta.json` (added/updated commit SHAs and PR numbers)

## Errors

| Error | Action |
|-------|--------|
| `no repos in config` | Ask user to fill `config/github-repos.json` |
| auth failed | Set `GITHUB_TOKEN` or run `gh auth login` |
| repo access denied | Remove repo or fix permissions; note in refresh log |

## Weekly loop

After the **first successful** index, point the user to [docs/WEEKLY-REFRESH.md](../../../docs/WEEKLY-REFRESH.md) to arm `/loop 7d /refresh-github-profile` (runs once immediately, then every 7 days). That doc is the single source for the loop setup.
