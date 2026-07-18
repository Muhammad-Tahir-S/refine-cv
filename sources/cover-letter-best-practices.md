# Cover letter best practices

Actionable rules for cover letter generation in this repo. Each rule lists **Why**, **Source IDs** (see [references.json](references.json)), and **Anti-patterns**.

Primary authorities: university career centers (Harvard, MIT, UC Berkeley). Recruiter-survey sources are **context only** for length and AI-screening prevalence.

---

## 1. Purpose and stance

### Rule: The letter expands on the CV; it never repeats it

**Why:** Reviewers read the letter for story and fit, not a prose duplicate of the resume. Pick one or two experiences and add the detail the CV format cannot hold. [harvard-hes-2024-pdf] [mit-capd-cover-letter] [berkeley-career-cover-letters]

**Source IDs:** `harvard-hes-2024-pdf`, `mit-capd-cover-letter`, `berkeley-career-cover-letters`

**Anti-patterns:**
- Paragraph-form restatement of CV bullets
- Listing skills without connecting them to the role's stated needs

### Rule: Frame everything as what you offer the employer

**Why:** The overarching theme is what you can do for them, not what the role does for you. [berkeley-career-cover-letters] [harvard-hes-2024-pdf]

**Source IDs:** `berkeley-career-cover-letters`, `harvard-hes-2024-pdf`

**Anti-patterns:**
- "This role would help me grow…" framing
- Motivation paragraphs with no link to the employer's needs

### Rule: Treat the letter as a writing sample

**Why:** Reviewers judge writing ability directly from the letter. Vary sentence openings; do not start every sentence with "I"; no flowery language. [harvard-hes-2024-pdf] [mit-capd-cover-letter]

**Source IDs:** `harvard-hes-2024-pdf`, `mit-capd-cover-letter`

**Anti-patterns:**
- Five consecutive sentences opening with "I"
- Brochure tone, superlatives, filler enthusiasm

---

## 2. Structure

### Rule: Follow the established four-part structure

**Why:** Readers process many letters at once and have fixed expectations; creative structure slows the yes/no decision against you. [mit-eecs-commlab-cover-letter] [mit-capd-cover-letter]

**Source IDs:** `mit-eecs-commlab-cover-letter`, `mit-capd-cover-letter`

Parts:

1. **Opening** — name the exact role (and req number if any), one-sentence professional introduction, and the single strongest verified proof point that maps to the JD.
2. **Body (1–2 paragraphs)** — one anchor example told concretely: the constraint, the decision (including what was considered and rejected where true), what shipped, the measurable result. Touch the JD's core skill directly.
3. **Why this company** — name one specific, real thing (product, engineering blog post, open-source tool, stated challenge) and connect it to something already done.
4. **Close** — restate fit in one sentence, thank the reader, state interest in a conversation.

**Anti-patterns:**
- "I am writing to express my interest…" openers
- Body paragraphs that list three shallow projects instead of one deep one
- Company flattery with no specific referent

### Rule: 250–400 words, one page; lean short for engineering roles

**Why:** Hiring managers prefer this range; engineering guidance in 2026 favors under ~300 words. Senior roles may run to ~400. Obey any explicit employer word limit first. [resumegenius-cover-letter-stats] [mit-capd-cover-letter] [harvard-hes-2024-pdf]

**Source IDs:** `resumegenius-cover-letter-stats`, `mit-capd-cover-letter`, `harvard-hes-2024-pdf`

**Anti-patterns:**
- Two-page letters; letters under ~150 words that read dismissive
- Padding to reach a word count

### Rule: Address a named person when findable; links below the sign-off

**Why:** Named greetings outperform generic ones ("Dear Hiring Manager" as fallback; never "To Whom It May Concern"). Portfolio/GitHub links belong in a block under the signature, not inside the closing paragraph. [mit-capd-cover-letter] [berkeley-career-cover-letters]

**Source IDs:** `mit-capd-cover-letter`, `berkeley-career-cover-letters`

**Anti-patterns:**
- "To Whom It May Concern"
- URLs jammed into the closing sentence

---

## 3. Evidence and AI-era authenticity (context)

### Rule: Personal anchoring beats polish

**Why:** Recruiters reject generic letters, not assisted ones. Specific tools, timeframes, trade-offs, and setbacks are what read as human; verified GitHub evidence supplies them. Surveys report most hiring managers view obviously generic AI letters negatively. [recruiter-ai-context-2026]

**Source IDs:** `recruiter-ai-context-2026`

**Anti-patterns:**
- Claims no evidence source supports (CV, GitHub index, questionnaire)
- "Proven track record," "detail-oriented professional," and similar mass-produced phrases
- A letter that could be sent to any company unchanged

### Rule: Never invent employers, projects, metrics, or company facts (repo guardrail)

**Why:** Ethical baseline; unsupported items go to the job report as gaps.

**Source IDs:** _(workflow guardrail; aligns with Harvard fact-based guidance)_ `harvard-mcs-resume`

**Anti-patterns:**
- Citing a company blog post or launch not actually verified
- Promoting `needs-your-confirmation` GitHub bullets without user approval

---

## Checklist for `cover-letter-report.md`

- [ ] Exact role (and req number) named in the opening
- [ ] One verified proof point in the first paragraph
- [ ] Body = one anchor example with constraint, decision, shipped result
- [ ] Why-this-company names something specific and real
- [ ] No CV repetition; letter adds detail the CV lacks
- [ ] 250–400 words (≈300 or less for engineering roles), one page
- [ ] Named greeting or "Dear Hiring Manager"; no "To Whom It May Concern"
- [ ] Links in a block below the sign-off
- [ ] Sentence openings varied; not every sentence starts with "I"
- [ ] Every claim traceable to CV, GitHub summary/index, or questionnaire
