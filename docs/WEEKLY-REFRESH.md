# Weekly GitHub refresh

Run only **after** the first successful `pnpm index-github`.

## Arm the loop

In Cursor chat (this workspace):

```
/loop 7d /refresh-github-profile
```

This should:

1. Run `/refresh-github-profile` **once immediately**
2. Re-run every **7 days** until you stop the loop

The agent will run `pnpm index-github`, update `profile/github-index.json`, `profile/github-summary.md`, and append a row to `profile/refresh-log.md`.

## Stop the loop

Ask the agent to stop the background loop (provide the terminal/shell if prompted).

## Manual refresh

```bash
pnpm index-github
```

Or run `/refresh-github-profile` in chat anytime.

## What changes weekly

- New commits since `profile/index-state.json` watermarks (`since=` API filter)
- New merged PR titles (if `includePullRequests` is true)
- Updated `github-summary.md` theme tags and draft bullets

Review `needs-your-confirmation` bullets before adding them to your CV.
