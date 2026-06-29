# /refresh-github-profile

Re-run GitHub evidence indexing for repos in `config/github-repos.json`.

## Instructions for the agent

1. Apply the **refresh-github-profile** skill: `.cursor/skills/refresh-github-profile/SKILL.md`
2. Ensure `config/github-repos.json` is populated.
3. Run `pnpm index-github` from the repo root.
4. Summarize deltas from `profile/refresh-log.md` and updated `profile/github-summary.md`.

## Weekly automation

After the first successful index, remind the user:

```
/loop 7d /refresh-github-profile
```

See [docs/WEEKLY-REFRESH.md](../../docs/WEEKLY-REFRESH.md).
