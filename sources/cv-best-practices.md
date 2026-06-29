# CV and ATS best practices

Actionable rules for tailoring in this repo. Each rule lists **Why**, **Source IDs** (see [references.json](references.json)), and **Anti-patterns**.

Primary authorities: university career centers (Harvard, Berkeley iSchool, UT Austin CNS). Jobscan [jobscan-2025-ats-report] is **context only** (ATS prevalence), not gospel for writing style.

---

## 1. Tailoring and keywords

### Rule: Mirror the job description with natural language

**Why:** ATS and recruiters search and rank by skills and phrases from the posting; alignment improves discoverability without replacing human judgment. [berkeley-ischool-ats] [ut-austin-cns-ats]

**Source IDs:** `berkeley-ischool-ats`, `ut-austin-cns-ats`

**Anti-patterns:**
- Keyword stuffing or invisible text
- Copying the JD verbatim into a “skills dump” section
- Claiming skills you cannot support from CV, GitHub index, or questionnaire

### Rule: Use both long-form and acronym for important terms

**Why:** Search filters may use either form (e.g. “product manager” and “PM”). [berkeley-ischool-ats]

**Source IDs:** `berkeley-ischool-ats`

**Anti-patterns:**
- Acronym-only lines with no expansion for niche terms
- Forcing awkward dual forms in every bullet

### Rule: One tailored version per application

**Why:** Recruiters and ATS work best when experience is mapped to that role’s duties and repeated keywords. [ut-austin-cns-ats]

**Source IDs:** `ut-austin-cns-ats`

**Anti-patterns:**
- Sending the same generic CV to every posting
- Inventing duties not in your history to match keywords

---

## 2. Structure and headings

### Rule: Reverse-chronological experience within standard sections

**Why:** Human reviewers skim quickly; ATS and recruiters parse chronological timelines reliably. [harvard-mcs-resume] [ut-austin-cns-ats]

**Source IDs:** `harvard-mcs-resume`, `ut-austin-cns-ats`

**Anti-patterns:**
- Functional-only layouts that hide timeline
- Non-standard section titles (“Where I’ve Made Impact”) that parsers may miss

### Rule: Use conventional headings

**Why:** Parsers expect familiar labels (e.g. Professional Experience, Education, Skills). [berkeley-ischool-ats]

**Source IDs:** `berkeley-ischool-ats`

**Anti-patterns:**
- Creative headings without a plain-text equivalent
- Burying contact info only in graphics or sidebars

### Rule: Order sections by importance to the target role

**Why:** Strongest assets should appear where scanners and humans look first. [harvard-mcs-resume]

**Source IDs:** `harvard-mcs-resume`

**Anti-patterns:**
- Leading with unrelated early roles
- Hiding relevant technical skills below unrelated content

---

## 3. Bullets and human review

### Rule: Lead with strong action verbs; quantify where truthful

**Why:** Passive language and missing outcomes weaken impact; fact-based metrics differentiate candidates. [harvard-mcs-resume]

**Source IDs:** `harvard-mcs-resume`

**Anti-patterns:**
- Passive voice (“responsible for”, “involved in”)
- Unverifiable superlatives (“world-class”, “best-in-industry”)
- Fabricated percentages or team sizes

### Rule: No personal pronouns; concise skim-friendly lines

**Why:** Professional CV style and fast scanning for humans and systems. [harvard-mcs-resume]

**Source IDs:** `harvard-mcs-resume`

**Anti-patterns:**
- First-person narrative paragraphs in experience sections
- Dense blocks without white space

### Rule: Language should be specific, active, and articulate—not flowery

**Why:** Readers and parsers reward clarity over impressionistic prose. [harvard-mcs-resume]

**Source IDs:** `harvard-mcs-resume`

**Anti-patterns:**
- Abbreviations undefined on first use (except widely known in the field)
- Slang, colloquialisms, or humor that obscures facts

### Rule: Consistent formatting throughout

**Why:** Consistency aids skim-reading and clean PDF/DOCX conversion. [harvard-mcs-resume] [harvard-hes-2024-pdf]

**Source IDs:** `harvard-mcs-resume`, `harvard-hes-2024-pdf`

**Anti-patterns:**
- Mixed date formats, fonts, or bullet styles
- Information gaps (e.g. unexplained employment gaps) without brief honest context when needed

---

## 4. ATS format and file type

### Rule: Single-column, parser-friendly layout

**Why:** Tables, multi-column layouts, text boxes, and graphics often break ATS parsing. [berkeley-ischool-ats] [ut-austin-cns-ats] [harvard-hes-2024-pdf]

**Source IDs:** `berkeley-ischool-ats`, `ut-austin-cns-ats`, `harvard-hes-2024-pdf`

**Anti-patterns:**
- Canva-heavy or image-based “resume designs”
- LaTeX or complex layouts when the employer portal expects simple DOCX
- Tables for core experience content

### Rule: Put contact information in the document body, not header/footer

**Why:** Header/footer content is often dropped during parsing. [berkeley-ischool-ats]

**Source IDs:** `berkeley-ischool-ats`

**Anti-patterns:**
- Phone/email only in Word header/footer
- Icons replacing plain-text contact lines

### Rule: Prefer DOCX for portal uploads when allowed; PDF when specified or for direct email

**Why:** Portals often parse DOCX more predictably; Harvard guidance notes checking that PDF conversion preserves layout. [harvard-mcs-resume] [harvard-hes-2024-pdf]

**Source IDs:** `harvard-mcs-resume`, `harvard-hes-2024-pdf`

**Anti-patterns:**
- Uploading PDF to a system that explicitly requests DOCX without verifying render
- Scanned image PDFs (non-selectable text)

### Rule: Avoid graphics, objects, and columns for ATS-bound submissions

**Why:** ATS may not “read” non-linear layout accurately. [ut-austin-cns-ats]

**Source IDs:** `ut-austin-cns-ats`

**Anti-patterns:**
- Skill bars, charts, or logos in place of text lists
- Multi-column templates from design sites

---

## 5. Honesty and evidence (repo-specific)

### Rule: Never invent employers, titles, dates, or metrics

**Why:** Ethical baseline; this repo aggregates GitHub and questionnaire evidence to support claims.

**Source IDs:** _(workflow guardrail; aligns with Harvard fact-based guidance)_ `harvard-mcs-resume`

**Anti-patterns:**
- Bullets tagged `verified-from-github` without running the indexer
- Publishing employer confidential codenames from questionnaire red lines

### Rule: Flag gaps and ask the user before asserting missing facts

**Why:** Unsupported claims belong in `profile/gap-report.md`, not the tailored CV.

**Source IDs:** _(workflow guardrail)_

**Anti-patterns:**
- Inferring production ownership from a single commit
- Listing company names for repos the user marked as red-line

### Rule: Tag evidence in drafts

**Why:** Separates provable GitHub themes from hypotheses.

**Source IDs:** _(workflow guardrail)_

**Anti-patterns:**
- Mixing `needs-your-confirmation` bullets into final CV without approval

---

## 6. ATS prevalence (context only)

### Rule: Assume large employers often use an ATS; still optimize for humans

**Why:** High-volume employers filter and rank applications; algorithms are imperfect and many recruiters still skim manually. [berkeley-ischool-ats] [jobscan-2025-ats-report]

**Source IDs:** `berkeley-ischool-ats`, `jobscan-2025-ats-report`

**Anti-patterns:**
- Treating ATS as the only audience
- Relying on Jobscan vendor stats as sole writing authority

---

## Checklist (human + ATS) for `match-report.md`

Use at the end of every tailoring run:

- [ ] JD keywords reflected naturally (long + acronym where relevant)
- [ ] Reverse-chronological, standard headings
- [ ] Action verbs; quantified impact only where verified
- [ ] Single-column; no tables/columns/graphics for ATS upload
- [ ] Contact info in body, not header/footer
- [ ] File format matches employer instructions (DOCX vs PDF)
- [ ] No invented facts; gaps listed for user
- [ ] Evidence tags respected (`verified-from-github` vs `needs-your-confirmation`)
