# /onboard

Complete agent-driven onboarding: questionnaire gap-filling, enhanced base CV, and gap report.

## Instructions for the agent

Apply the **onboard-profile** skill (`.cursor/skills/onboard-profile/SKILL.md`). Mechanical setup (CV extraction, GitHub indexing, pack install) should already be done via `pnpm setup`. If not, check `config/refine-cv.json` and re-run missing wizard steps before continuing.

## User prompt template

> Run onboarding: fill questionnaire gaps, write `profile/base-cv-enhanced.md` and `profile/gap-report.md`.
