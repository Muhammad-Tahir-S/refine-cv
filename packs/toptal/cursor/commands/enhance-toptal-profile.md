# /enhance-toptal-profile

Enhance your baseline Toptal platform profile (bio, skills, portfolio) using Toptal best practices and verified profile/GitHub evidence.

## Instructions for the agent

Apply the **enhance-toptal-profile** skill (`.cursor/skills/enhance-toptal-profile/SKILL.md`) with rules `.cursor/rules/toptal-writing.mdc` and `.cursor/rules/writing-style.mdc`. The skill owns the full workflow: source loading, saving the current snapshot to `profile/toptal-profile-current.md`, producing `profile/toptal-profile-enhanced.md` and `profile/toptal-profile-gap-report.md`, the writing-style polish pass, and reporting the top 3 changes before the user updates Toptal.

## User prompt template

> Paste your current Toptal profile below (bio, skills with levels, portfolio projects). I will enhance it using `profile/base-cv-enhanced.md`, GitHub summary, and Toptal best practices.
