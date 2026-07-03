# Developer — Profile Creation Guide

**Source ID:** `toptal-profile-creation-guide-pdf`  
**Publisher:** Toptal (Confidential & Proprietary — internal talent guide)  
**Extracted:** 2026-06-29 (OCR text layer)  
**PDF:** [pdf/Developer - Profile Creation Guide.pdf](pdf/Developer%20-%20Profile%20Creation%20Guide.pdf)  
**Pages:** 16

This is the **primary authority** for baseline Toptal profile enhancement in refine-cv.

---

## 1. Introduction — why the profile matters

Your Toptal profile is a **marketing tool** for internal matchers and clients. When Toptal selects you for a project, your profile is sent to the client, who decides whether you are the right fit.

**Why polish it:**

- Toptal responds to project requests with relevant talent within **24 hours**
- **Over 90%** of clients choose one of the initial candidates proposed
- Detailed, compelling profiles make this possible

**Goal:** Impress clients who receive your profile and make them want to interview you.

---

## 2. Profile structure

| Section | Purpose |
|---------|---------|
| **Headshot** | Professional first impression |
| **Basic Information / About** | Hook clients; matcher intro summary |
| **Education** | Academic degrees and equivalents |
| **Work Experience** | Depth and impact of professional history |
| **Certifications** | MOOCs, nanodegrees, professional certs (not full degrees) |
| **Skills & Expertise** | Skill tags, levels, connections to evidence |
| **Portfolio Projects** | Things you **made** (vs. employment: things you **did**) |
| **Time Zone & Working Hours** | Availability and overlap with prospective jobs |

Also include **Preferred environment** (tools: Jira, Slack, VS Code, etc.) when relevant.

---

## 3. Headshot guidelines

A clean, professional headshot is **required**. All Toptal profile photos should be:

| Requirement | Detail |
|-------------|--------|
| **Resolution** | At least **1000×1000** pixels; in focus, not grainy |
| **Lighting** | Even lighting; natural color; no filters, B&W, vignettes, airbrushing, circular frames |
| **Attire** | Business casual; smiling or pleasant demeanor; no graphic tees, sweatshirts, headphones, sunglasses |
| **Framing** | Camera ≥2.5 ft (80 cm) away; **shoulders up only**; face centered |
| **Background** | Light grey best; complex backgrounds blurred; you alone in frame |
| **Pose** | Direct eye contact; eyes level with lens; natural smile; good posture; face camera straight or slight angle |

Your photo is one of the first things clients see — it drives first impression in a fraction of a second.

---

## 4. About paragraph (Basic Information)

- **Length:** ~**three sentences**
- **Voice:** **Third person** (matchers use this text when introducing you to clients)
- **Open strong:** Notable work or professional achievement first — well-known brands, scale (users, team size)
- **Then:** Technical skills, experience, specialties
- **Balance:** Specifics vs. overall professional background
- **Focus:** Who you are, what you specialize in, how you work, why it helps **clients** (client focus first)
- Optional: tie to passions if it supports client value

### “The most amazing…” statement

Describe a **real-life scenario or project** that made you proud of your skills:

- Clear, specific, detailed
- Makes you stand out from other developers
- **Avoid** generic statements not tied to your accomplishments

---

## 5. Education

**Include:**

- Degreed programs from universities (certificate, associate, bachelor's, master's, international equivalents)
- Technical/vocational high school diplomas, IB secondary diplomas
- Exchange programs or coursework toward degrees embedded in a degree

**Do not put here:** MOOCs, nanodegrees, online courses — use **Certifications** instead.

---

## 6. Work experience

- Include **all** years of experience related to **software development**, not only target project types
- Bullets = **specific accomplishments**, not ongoing duties or future speculation
- Helps matchers/clients assess relevance for the project at hand

### Bullet format

- **3–10 bullets** per position
- **50–250 characters** each
- Start with **active verb in past tense**
- Include when possible:
  - **Quantified achievements**
  - **Unique skills**
  - **Specific result/outcome** of the work

**Good:** “Developed an online travel agency engine used by more than 30,000 agencies worldwide.”

**Bad:** “Developed a website.” (vague)

---

## 7. Certifications

For: nanodegrees, MOOCs, certificates, exam scores, verifiable professional qualifications (CPA, MSCP, etc.)

**Not for:** Full university degrees (Ph.D., MBA, Bachelor's, etc.) — those belong in Education.

---

## 8. Skills & expertise

- Tag skills across **seven categories**; be **comprehensive** — Toptal uses tags to determine fit
- Rate each skill: **Competent**, **Strong**, or **Expert** — be balanced; don’t oversell
- **First 15 skills** added generate tags under the public **About** section
- **Expertise section:** highlight up to **8** skills — primary and secondary skillsets only
- Revisit skills periodically; only list skills you can **attribute to a job or project**

### Skill connections (critical)

Connect skills to profile items:

- Work experience
- Portfolio projects
- Certifications
- Education

When clients search for a skill, they see it is **supported by relevant experience**. Connecting skills “dramatically increases your likelihood of being introduced to clients and eventually getting hired.”

---

## 9. Portfolio projects

**Purpose:** Showcase individual projects/products that illustrate skills — **things you made** (Employment = things you did).

- **Minimum 5** projects for developers (per matching handbook)
- High-quality examples: client work, volunteering, personal projects
- Each item should be **understandable on the profile** without visiting an external site
- **Links:** Go directly to the **project**, not to a generic online portfolio page
- Highlight **creativity and thought process**
- Include outcomes (e.g., revenue impact, user growth) when verified

Example pattern: describe takeover/redesign, business model extension, measurable revenue or cost impact.

---

## 10. Time zone and working hours

| Field | Meaning |
|-------|---------|
| **Working Hours** | Period you are available to **meet and interview** with clients (as if already working) |
| **Flexible Hours** | Time **before/after** working hours when you could meet occasionally — not regular work time |

System uses this to show overlap with prospective jobs.

---

## 11. Profile enhancement checklist (automation)

When running `/enhance-toptal-profile`, output should address:

- [ ] About: ~3 sentences, third person, client-focused, opens with strongest achievement
- [ ] “Most amazing…” statement: specific project, non-generic
- [ ] Work experience bullets: 3–10 per role, 50–250 chars, quantified where verified
- [ ] **5** portfolio projects with direct project links and on-profile descriptions
- [ ] Skills: comprehensive tags, honest Competent/Strong/Expert levels
- [ ] **Skill connections** mapped to work experience and portfolio entries
- [ ] Up to 8 expertise highlights from primary/secondary stack
- [ ] Headshot gaps noted against guidelines if user provides photo status
- [ ] Time zone / working hours / flexible hours recommendations from questionnaire
- [ ] Education vs. certifications correctly separated

Cross-reference [job-application-matching-handbook.md](job-application-matching-handbook.md) §8 for matcher search behavior (skills connected to jobs, external profile links, rate, overlap).
