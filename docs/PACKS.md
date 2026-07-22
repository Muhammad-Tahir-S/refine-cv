# Feature packs

refine-cv is modular. Each pack adds Cursor skills/commands/rules, CLI scripts, and optional source files. Only installed packs are copied into `.cursor/`.

## Manifest

[`packs.json`](../packs.json) at the repo root defines each pack:

- `label`, `description` — shown in the setup wizard
- `default` / `required` / `recommended` — selection defaults
- `dependsOn` — auto-installed dependencies (e.g. all packs depend on `core`)
- `cursor.skills`, `cursor.commands`, `cursor.rules` — assets synced to `.cursor/`
- `sources` — reference files the pack expects
- `scripts` — npm scripts associated with the pack

The manifest is the **single source of truth**: `pnpm setup` syncs (and removes) exactly the assets listed here, and `pnpm validate` checks each installed pack's assets and sources directly from the manifest — so adding an asset to a pack means adding it to both `packs/<name>/cursor/` and `packs.json`.

Installed packs are recorded in `config/refine-cv.json` (gitignored, created by setup).

## Packs

### core (always installed)

| Asset | Path |
|-------|------|
| Skills | `onboard-profile`, `avoid-ai-writing` |
| Commands | `/onboard`, `/avoid-ai-writing` |
| Rules | `cv-writing.mdc`, `writing-style.mdc`, `avoid-ai-writing.mdc` |
| Sources | `sources/cv-best-practices.md`, `sources/references.json`, `sources/writing-style.md`, `sources/evidence-hierarchy.md` |
| Scripts | `extract-cv`, `validate` |

### github-evidence (recommended)

| Asset | Path |
|-------|------|
| Skill | `refresh-github-profile` |
| Command | `/refresh-github-profile` |
| Scripts | `list-repos`, `index-github` |

Indexes selected repos for CV bullet evidence. Private repos: metadata only.

### tailor-cv (recommended)

| Asset | Path |
|-------|------|
| Skills | `tailor-cv`, `generate-cover-letter` |
| Commands | `/tailor-cv`, `/generate-cover-letter` |
| Sources | `templates/cv/resume.css`, `sources/cover-letter-best-practices.md` |
| Scripts | `render-cv`, `setup:pdf` |

Outputs live under `jobs/YYYY-MM-DD-company-role/`. PDF rendering needs a Puppeteer-managed Chrome (~170 MB) — the setup wizard offers to install it when this pack is selected; otherwise run `pnpm setup:pdf` before the first `pnpm render-cv`.

### job-scan (recommended)

| Asset | Path |
|-------|------|
| Skill | `scan-jobs` |
| Command | `/scan-jobs` |
| Sources | `config/job-sources.json` |
| Scripts | `scan-jobs`, `mark-applied`, `linkedin:login`, `discover-linkedin`, `setup:linkedin` |

Scan state lives under `~/.config/refine-cv/`. Copy `config/job-search*.example.json` before the first scan. LinkedIn discovery is optional and low-volume.

### toptal (opt-in)

| Asset | Path |
|-------|------|
| Skills | `generate-toptal-pitch`, `enhance-toptal-profile` |
| Commands | `/toptal-pitch`, `/enhance-toptal-profile` |
| Rule | `toptal-writing.mdc` |
| Scripts | `extract-toptal-guides` |

**Bring your own PDFs:** drop official Toptal guides in `sources/toptal-guides/pdf/` (exact filenames — see [sources/toptal-guides/README.md](../sources/toptal-guides/README.md)) and run `pnpm extract-toptal-guides`. Without PDFs the pack runs in **degraded mode**: skills fall back to `sources/toptal-best-practices.md` and note the reduced basis in their outputs.

## Canonical vs synced assets

```
packs/<name>/cursor/   ← edit here (committed to git)
        ↓ pnpm setup
.cursor/               ← agent reads from here (gitignored)
```

The sync is **non-destructive for your own assets**: only files listed in `packs.json` are removed or overwritten. Skills, commands, or rules you create directly in `.cursor/` (e.g. through Cursor itself) survive every sync. But do not edit **pack-owned** files in `.cursor/` — those are overwritten on the next sync; edit the copy in `packs/` instead.

## Lifecycle

```bash
pnpm setup                    # interactive wizard
pnpm setup --yes              # re-sync with current pack selection
pnpm setup --add toptal       # add pack + sync
pnpm setup --remove toptal    # remove pack + sync (cannot remove core)
```

After pulling tooling updates:

```bash
git pull
pnpm install
pnpm setup --yes
```

User data in `profile/`, `config/github-repos.json`, and `jobs/` is gitignored and untouched by pack sync.

## Adding a custom pack

1. Create `packs/my-pack/cursor/` with skills/commands/rules
2. Add an entry to `packs.json`
3. Run `pnpm setup --add my-pack`

Future: version packs and use `skills-lock.json` hashing to detect local modifications before overwrite.
