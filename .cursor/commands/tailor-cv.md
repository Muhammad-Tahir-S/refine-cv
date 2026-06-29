# /tailor-cv

Tailor your CV to a job description using this repo’s best practices and profile evidence.

## Instructions for the agent

1. Apply the **tailor-cv** skill: `.cursor/skills/tailor-cv/SKILL.md`
2. Apply rule: `.cursor/rules/cv-writing.mdc`
3. Ask the user to **paste the full job description** (or give a path to a `.md` / `.txt` file).
4. Create folder `jobs/YYYY-MM-DD-company-role/` with slug from company + role.
5. Save JD as `job-description.md`.
6. Produce `tailored-cv.md`, `match-report.md`, and optional `cover-letter-hooks.md`.
7. Run `pnpm render-cv jobs/YYYY-MM-DD-company-role/tailored-cv.md` to produce `tailored-cv.pdf`.
8. Report keyword match highlights and any **questions** before the user submits.

## User prompt template

> Paste the job description below. I will tailor your CV using `profile/base-cv-enhanced.md` (or `base-cv.md`), GitHub summary, and questionnaire.
