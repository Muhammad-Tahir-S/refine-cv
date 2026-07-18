# /generate-cover-letter

Generate a tailored cover letter from a job description using this repo's evidence and prose rules.

## Instructions for the agent

Apply the **generate-cover-letter** skill (`.cursor/skills/generate-cover-letter/SKILL.md`) with rules `.cursor/rules/cv-writing.mdc` and `.cursor/rules/writing-style.mdc`. The skill owns the full workflow: JD intake, job folder, evidence mapping from `base-cv-enhanced.md` / `github-summary.md` / `github-index.json`, drafting under `sources/writing-style.md`, the mandatory avoid-ai-writing detect pass, and `cover-letter.md` + `cover-letter-report.md` outputs.

## User prompt template

> Paste the job description below. I will write a cover letter grounded in your CV, GitHub evidence, and questionnaire, then run the anti-AI double-check before handing it over.
