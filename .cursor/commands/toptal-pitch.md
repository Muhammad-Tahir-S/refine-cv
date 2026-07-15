# /toptal-pitch

Generate a third-person Toptal job application pitch from a pasted job description.

## Instructions for the agent

Apply the **generate-toptal-pitch** skill (`.cursor/skills/generate-toptal-pitch/SKILL.md`) with rules `.cursor/rules/toptal-writing.mdc` and `.cursor/rules/writing-style.mdc`. The skill owns the full workflow: source loading, job-folder creation, the pitch-doctrine gate, `pitch.md` + `pitch-match-report.md` outputs, the writing-style polish pass, and handoff. Do not run `/tailor-cv` unless the user also asks for a tailored CV.

## User prompt template

> Paste the Toptal job description below. I will generate a third-person application pitch using `profile/base-cv-enhanced.md`, GitHub summary, and Toptal best practices.
