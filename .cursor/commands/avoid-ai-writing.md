# /avoid-ai-writing

Audit or rewrite prose to remove AI writing patterns ("AI-isms").

## Instructions for the agent

Apply the **avoid-ai-writing** skill (`.cursor/skills/avoid-ai-writing/SKILL.md`) with rule `.cursor/rules/avoid-ai-writing.mdc`.

**Upstream:** [conorbronsdon/avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing) v3.15.0 (MIT). Vendored in this repo; re-sync with:

```bash
curl -fsSL -o .cursor/skills/avoid-ai-writing/SKILL.md \
  https://raw.githubusercontent.com/conorbronsdon/avoid-ai-writing/main/SKILL.md
curl -fsSL -o .cursor/rules/avoid-ai-writing.mdc \
  https://raw.githubusercontent.com/conorbronsdon/avoid-ai-writing/main/cursor-rules/avoid-ai-writing.mdc
```

**Modes:** `rewrite` (default), `detect` (flag only), `edit` (fix file in place).

**Job-application context:** For CV/cover letter/pitch generation, `sources/writing-style.md` runs at draft time. Use this skill as a **second pass** before sending high-stakes applications.

## User prompt template

> Audit `jobs/…/cover-letter.md` for AI patterns in detect mode — flag only, don't rewrite.

> Remove AI-isms from this pitch paragraph. Use professional voice.

> Edit `jobs/…/cover-letter.md` in place and verify the polish pass.
