# refine-cv

Private workflow for tailoring your CV to job descriptions using **citable** ATS and human-review best practices, a local profile (PDF + questionnaire), and incremental GitHub evidence from repos you choose.

Built with **TypeScript** and **pnpm** (no Python or shell scripts).

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/): `npm install -g pnpm`
- GitHub auth: `GITHUB_TOKEN` in `.env` **or** [GitHub CLI](https://cli.github.com/) (`gh auth login`)

**Security:** Keep this repository **private**. It may contain PII (CV, questionnaire, job descriptions).

## Setup

Requires **Node 18+** (see `.nvmrc` for v22).

```bash
nvm use   # optional
pnpm install
pnpm build
```

## Quick start

1. Add your master CV: `profile/base-cv.pdf`
2. `pnpm extract-cv`
3. `pnpm list-repos` — pick repos → add to `config/github-repos.json`
4. `pnpm index-github`
5. In Cursor chat, ask the agent to **onboard** (questionnaire, enhanced base CV)
6. Per application: `/tailor-cv` + paste job description → `pnpm render-cv jobs/.../tailored-cv.md`
7. After first index: `/loop 7d /refresh-github-profile`

## CLI commands

| Command | Description |
|---------|-------------|
| `pnpm extract-cv` | PDF → `profile/base-cv.md` |
| `pnpm render-cv` | Markdown CV → ATS-friendly PDF |
| `pnpm list-repos` | Repos you pushed to (~10 years) → `profile/github-repo-candidates.md` |
| `pnpm index-github` | Index selected repos → `github-index.json` + summary |
| `pnpm validate` | Check onboarding readiness |
| `pnpm typecheck` | TypeScript check |

### GitHub authentication

Create `.env` (gitignored):

```bash
GITHUB_TOKEN=ghp_...
```

Or log in via the CLI:

```bash
pnpm auth:github
```

After login, `pnpm list-repos` and `pnpm index-github` use `gh auth token` automatically.

### PDF export

Render a tailored or base CV to PDF:

```bash
pnpm render-cv jobs/2026-06-04-company-role/tailored-cv.md
pnpm render-cv profile/base-cv-enhanced.md --out profile/base-cv-preview.pdf
```

First-time setup for PDF export (downloads Chromium for Puppeteer):

```bash
pnpm setup:pdf
```

This also runs automatically after `pnpm install`.

The renderer strips internal evidence tags, uses a single-column ATS-friendly template (`templates/cv/resume.css`), and writes selectable text (not image-only). Compare `profile/base-cv-preview.pdf` with `profile/base-cv.pdf` when calibrating layout.

## Directory layout

| Path | Purpose |
|------|---------|
| `src/` | TypeScript CLI and libraries |
| `templates/cv/` | Print CSS for PDF export |
| `sources/cv-best-practices.md` | Rules with citation IDs |
| `profile/base-cv.pdf` | Canonical CV |
| `profile/github-repo-candidates.md` | Repo picker output from `list-repos` |
| `config/github-repos.json` | Username + repos to index |
| `jobs/` | One folder per application |
| `.cursor/skills/` | Agent skills |

## Cursor commands

| Command | Action |
|---------|--------|
| `/tailor-cv` | Paste JD → tailored CV + match report + PDF |
| `/refresh-github-profile` | Run `pnpm index-github` |

Weekly refresh (after first successful index):

```
/loop 7d /refresh-github-profile
```

## Onboarding

See [profile/ONBOARDING.md](profile/ONBOARDING.md). Run `pnpm validate` to check progress.

## Privacy note (private repos)

Private and employer repos can be indexed for **metadata only** (commit subjects, PR titles, languages, themes). Tailored outputs must **not** include proprietary source code — see `profile/questionnaire.md`.
