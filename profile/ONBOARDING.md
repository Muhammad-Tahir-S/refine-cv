# Onboarding

## Step 0 — Local config (first time only)

These files are gitignored. Copy from the tracked examples if missing:

```bash
cp config/github-repos.example.json config/github-repos.json
cp config/job-search.example.json config/job-search.json
cp config/job-search-nodejs-backend.example.json config/job-search-nodejs-backend.json
```

Edit `config/job-search.json` for your location and work-permit constraints before running job scans.

## Step 1 — Master CV

1. Add `profile/base-cv.pdf`
2. Extract:

```bash
pnpm extract-cv
```

## Step 2 — Discover GitHub repos

```bash
pnpm list-repos
```

Opens `profile/github-repo-candidates.md`. Copy chosen `owner/repo` values into [config/github-repos.json](../config/github-repos.json).

## Step 3 — Index selected repos

Ensure `GITHUB_TOKEN` or `gh auth login`, then:

```bash
pnpm index-github
```

## Step 4 — Questionnaire

Complete [questionnaire.md](questionnaire.md) with the agent (metrics, red lines, per-employer scope).

## Step 5 — Enhanced base CV

Agent produces `base-cv-enhanced.md` and `gap-report.md`. Review before `/tailor-cv`.

## Step 6 — Weekly refresh

```
/loop 7d /refresh-github-profile
```

See [docs/WEEKLY-REFRESH.md](../docs/WEEKLY-REFRESH.md).
