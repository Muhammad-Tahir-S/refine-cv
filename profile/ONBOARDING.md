# Onboarding

Mechanical setup is handled by **`pnpm setup`**. Agent-driven steps use **`/onboard`** in Cursor chat.

## Step 1 — Run setup

```bash
pnpm install
pnpm setup
```

The wizard handles:

- Feature pack selection and `.cursor/` sync (seeds `profile/questionnaire.md` from the template)
- Chrome install for PDF rendering (if tailor-cv pack selected)
- CV intake — PDF path **or pasted text** → `profile/base-cv.md`
- GitHub auth (can run `gh auth login` for you), repo picker, and index (if github-evidence pack selected)

Re-run anytime; completed steps are skipped. `Ctrl+C` cancels cleanly.

## Step 2 — Agent onboarding

In Cursor chat:

```
/onboard
```

The agent will:

- Fill questionnaire gaps in `profile/questionnaire.md`
- Write `profile/base-cv-enhanced.md` and `profile/gap-report.md`

Review `gap-report.md` before tailoring CVs.

## Step 3 — Validate

```bash
pnpm validate
```

## Step 4 — Weekly refresh (github-evidence pack)

After the first successful index:

```
/loop 7d /refresh-github-profile
```

See [docs/WEEKLY-REFRESH.md](../docs/WEEKLY-REFRESH.md).

## Re-running setup

```bash
pnpm setup              # full wizard
pnpm setup --yes        # re-sync packs with current selections
pnpm setup --add toptal # add a pack
```
