# Writing style — anti-AI patterns for job-application prose

**Scope:** All agent-generated prose in refine-cv — CV bullets, cover letters, Toptal pitches and profiles, match reports, and application answers.

**Load order:** Read this file **before drafting** any prose output. It complements (does not replace) `sources/cv-best-practices.md` and `sources/toptal-best-practices.md`. Personal overrides live in `profile/questionnaire.md` § Writing voice.

**Goal:** Sound like a specific person stating facts, not a model performing emphasis. Fix **clusters** of tells, not single words in isolation.

---

## 1. Hard bans (P0 — fix before saving)

### Em dashes

- **Target: zero** em dashes (`—`) and double-hyphen substitutes (`--`) in every job-application output.
- Use a comma, a period (split into two sentences), or parentheses instead.
- In project-link lines, use a colon or hyphen with spaces: `https://example.com - description`.

**Before:** `Alex — a frontend engineer who builds…`  
**After:** `Alex is a frontend engineer who builds…` or `Alex, a frontend engineer, builds…`

### Contrast clichés

Do **not** use these rhetorical frames:

| Pattern | Example |
|---------|---------|
| Not just / not only | `not just an applicant`, `not only storing code` |
| X is not Y; it is Z | `A bug is not cosmetic; it is a trust defect` |
| Split-sentence negation | `The headline isn't the speed. The real story is Y.` |
| X, not Y | `part of shipping, not a separate phase` |
| Stacked negation countdown | `It's not the price. It's not the features. It's the trust.` |

**Instead:** State the positive claim in plain form.

**Before:** `I treat testing as part of shipping, not a separate phase.`  
**After:** `I ship component and integration tests in the same PR as the feature.`

### Tier-1 vocabulary (replace on sight)

| Avoid | Use |
|-------|-----|
| delve, leverage (verb), harness, foster, navigate | explore, use, handle |
| robust, seamless, comprehensive, pivotal, holistic | strong, smooth, full, important, complete |
| landscape (metaphor), tapestry, realm, paradigm | field, area, model |
| cutting-edge, game-changer, transformative | latest, (describe what changed) |
| utilize, commence, ascertain, endeavor | use, start, find out, effort |
| showcase, underscore, embark, testament to | show, highlight, start, shows |
| actionable, impactful, learnings | practical, effective, lessons |

### Chatbot artifacts

Remove entirely: `I hope this helps`, `Great question`, `Certainly`, `Feel free to reach out`, `Let me know if you need anything else`, `Let's dive in`, `In this article we will explore`.

---

## 2. Common limits (P1 — fix in polish pass)

- **Hollow intensifiers:** Cut `genuinely`, `truly`, `quite frankly`, `it's worth noting`, `notably`, `interestingly`.
- **Copula avoidance:** Prefer `is` / `has` over `serves as`, `features`, `boasts`, `presents`.
- **Transition spam:** Avoid `Moreover`, `Furthermore`, `Additionally`, `In today's…`, `When it comes to`.
- **Rule of three:** Do not end every paragraph with a triad (`A, B, and C`). Vary count and shape.
- **Significance inflation:** Cut `pivotal moment`, `watershed`, `game-changing` unless a specific outcome backs it.
- **Generic closers:** Cut `excited to apply`, `passion for excellence`, `the future looks bright`, `only time will tell`.
- **Hedge stacks:** One hedge per claim. Not `could potentially` or `may eventually`.
- **Uniform rhythm:** Mix short sentences (5–8 words) with longer ones. Avoid five sentences in a row of similar length.
- **Synonym cycling:** Repeat the clearest noun instead of rotating `developers / engineers / practitioners` in one paragraph.

---

## 3. Output-specific rules

| Output | Person | Em dashes | Contrast clichés | Notes |
|--------|--------|-----------|------------------|-------|
| `tailored-cv.md` | No pronouns | Zero | Zero | Active verbs; facts only |
| `cover-letter.md` | First person OK | Zero | Zero | Direct; no brochure tone |
| `cover-letter-hooks.md` | Fragments OK | Zero | Zero | Factual bullets only |
| Toptal `pitch.md` | Third person (required) | Zero | Zero | Plain text in paste blocks |
| `toptal-profile-enhanced.md` | Third person | Zero | Zero | Paste blocks plain text |
| `match-report.md` / `pitch-match-report.md` | Analytical | Zero in prose | Low | Tables and checklists OK |

Respect Toptal third-person rules from `toptal-best-practices.md` §1. Anti-AI rules apply on top.

---

## 4. Mandatory polish pass

Run **after drafting, before writing the file to disk**:

1. Search for `—` and `--` → rewrite (target: zero).
2. Search for contrast frames: `not just`, `not only`, `isn't`, `is not`, `, not a`, `, not ` → rewrite to positive claims.
3. Scan Tier-1 vocabulary table → replace.
4. Scan P1 list → trim hedges, transitions, and triads.
5. Read aloud (mentally): if every sentence is the same length, vary one or two.

Log results in the job report under **Style pass** (see §5).

---

## 5. Style pass (report section)

Add to `match-report.md`, `pitch-match-report.md`, and profile gap reports when prose was generated:

```markdown
## Style pass

| Check | Pass? | Notes |
|-------|-------|-------|
| Zero em dashes | | |
| No contrast clichés | | |
| Tier-1 vocabulary clean | | |
| Sentence rhythm varied | | |
```

If a check fails, fix the prose and re-run before handoff.

---

## 6. Examples (job-application register)

### Cover letter opening

**Before:**  
`I'm Alex — a frontend engineer. I'm writing as a potential colleague, not just an applicant.`

**After:**  
`I'm Alex, a frontend engineer with five years on TypeScript and React for international B2B SaaS teams. I'm writing to introduce myself as a potential colleague.`

### Product fit paragraph

**Before:**  
`You are not only storing source code in a vault; you are helping vendors prove continuity — through automatic deposit sync and verification levels.`

**After:**  
`Codekeeper helps vendors and clients prove software continuity through automatic deposit sync, verification levels, and certificates auditors can rely on.`

### CV bullet

**Before:**  
`Leveraged robust React patterns to seamlessly deliver comprehensive dashboard solutions.`

**After:**  
`Built React analytics dashboards with server-side tables and shared Chakra UI components across three client products.`

---

## 7. Pre-ship checklist

- [ ] Zero `—` and `--` in all prose outputs
- [ ] No `not just`, `not only`, or `X, not Y` contrast frames
- [ ] No Tier-1 vocabulary from §1
- [ ] No chatbot closers or sycophant openers
- [ ] Questionnaire § Writing voice honored
- [ ] Style pass table in report marked pass

---

## 8. Deep audit (optional second pass)

For high-stakes sends, run **avoid-ai-writing** after the polish pass:

| When | What |
|------|------|
| After `/tailor-cv` cover letter | `/avoid-ai-writing` in **detect** mode on `cover-letter.md` |
| Before submitting Toptal pitch | `/avoid-ai-writing` in **edit** mode on `pitch.md` |
| Any prose you're unsure about | `/avoid-ai-writing` with voice `professional` |

**Two-layer model:**

1. **Draft time** — this file (`writing-style.md`) + questionnaire § Writing voice. Mandatory on every generation run.
2. **Pre-send** — [avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing) skill (vendored at `.cursor/skills/avoid-ai-writing/SKILL.md`). 53 pattern categories, P0/P1/P2 severity, rewrite/detect/edit modes, voice profiles.

Cursor command: `/avoid-ai-writing`. Rule: `.cursor/rules/avoid-ai-writing.mdc`.
