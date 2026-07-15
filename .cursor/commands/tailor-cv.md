# /tailor-cv

Tailor your CV to a job description using this repo’s best practices and profile evidence.

## Instructions for the agent

Apply the **tailor-cv** skill (`.cursor/skills/tailor-cv/SKILL.md`) with rules `.cursor/rules/cv-writing.mdc` and `.cursor/rules/writing-style.mdc`. The skill owns the full workflow: source loading, job-folder creation, keyword mapping, `tailored-cv.md` + `match-report.md` (+ optional `cover-letter-hooks.md` or `cover-letter.md`) outputs, the writing-style polish pass, the `pnpm render-cv` PDF step, and handoff.

## User prompt template

> Paste the job description below. I will tailor your CV using `profile/base-cv-enhanced.md` (or `base-cv.md`), GitHub summary, and questionnaire.
