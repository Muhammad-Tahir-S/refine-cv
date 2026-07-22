# /generate-cover-letter

Generate a tailored cover letter from a job description using this repo's evidence and prose rules.

## Instructions for the agent

Apply the **generate-cover-letter** skill (`.cursor/skills/generate-cover-letter/SKILL.md`) with rules `.cursor/rules/cv-writing.mdc` and `.cursor/rules/writing-style.mdc`. The skill owns the full workflow: JD intake, job folder, **mandatory grep of `profile/github-index.json` before drafting** (see `sources/evidence-hierarchy.md`), evidence mapping from merged PRs/commits, drafting under `sources/writing-style.md`, the mandatory avoid-ai-writing detect pass, and `cover-letter.md` + `cover-letter-report.md` outputs.

## User prompt template

> Paste the job description below. I will grep your GitHub index for JD-matching PRs, write a cover letter from concrete commit history (not CV paraphrase), and run the anti-AI double-check before handing it over.
