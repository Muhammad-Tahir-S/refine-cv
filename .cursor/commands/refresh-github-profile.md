# /refresh-github-profile

Re-run GitHub evidence indexing for repos in `config/github-repos.json`.

## Instructions for the agent

Apply the **refresh-github-profile** skill (`.cursor/skills/refresh-github-profile/SKILL.md`). The skill owns the full workflow: confirming `config/github-repos.json`, running `pnpm index-github`, summarizing deltas from `profile/refresh-log.md` and `profile/github-summary.md`, and the weekly-loop handoff (see [docs/WEEKLY-REFRESH.md](../../docs/WEEKLY-REFRESH.md)).
