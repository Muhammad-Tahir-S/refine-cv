# Job Scan Report

**Scan date:** 18 July 2026  
**Primary output:** this Markdown file (`report.md`). `raw.json` is a machine archive only.  
**Source:** Public job boards (`config/job-sources.json`) — Himalayas, Jobicy, Remotive, Arbeitnow, Remote OK, We Work Remotely, HN Who is Hiring  
**Applicant geo:** Nigeria citizen, work permit in Nigeria only (`config/job-search.json`)  
**New this run:** _No new listings this run — all matches below were seen in a prior scan._  
**Criteria:**
- React / frontend focus
- Junior → senior level (staff/lead flagged, not dropped)
- **Nigeria-eligible:** global remote or explicit Nigeria/Africa/unrestricted hire signals
- **Verify geo:** EMEA or unclear remote — manual check before applying
- **Likely excluded:** EU/UK/US-only, hybrid/on-site, or Africa-excluded listings

---

## Method

1. Fetch enabled public job boards from `config/job-sources.json` (no login required).
2. Normalize listings, apply employer blocklist from `config/job-search.json`.
3. Filter for React/frontend + geo eligibility (`src/lib/jobs/geo.ts`).
4. Dedupe against `~/.config/refine-cv/scan-state.json` and applied jobs from prior report checkboxes.
5. LinkedIn discovery remains optional (`pnpm discover-linkedin`) and separate from this scan.

---

## All matched — Nigeria-eligible

Prioritize these. **Status:** New = first time seen; Seen = still open from a prior scan.

| Status | Company | Role | Level | Remote | Geo | Source | Apply |
|--------|--------|------|-------|--------|-----|--------|-------|
| Seen | **Outlive** | Senior Full Stack Engineer - Future Openings | Staff/Lead | Global remote | Nigeria-eligible | himalayas | https://himalayas.app/companies/outlive/jobs/senior-full-stack-engineer-future-openings |
| Seen | **Growe Talents** | Senior Front End Developer | Senior | Global remote | Nigeria-eligible | himalayas | https://himalayas.app/companies/growe-talents/jobs/senior-front-end-developer |
| Seen | **Graswald** | Senior Full Stack Engineer | Staff/Lead | Global remote | Nigeria-eligible | himalayas | https://himalayas.app/companies/graswald/jobs/senior-full-stack-engineer-7266810978 |
| Seen | **Teravision Technologies** | Lead Fullstack Developer | Staff/Lead | Global remote | Nigeria-eligible | himalayas | https://himalayas.app/companies/teravision-technologies/jobs/lead-fullstack-developer |
| Seen | **Tether Operations Limited** | React Native Developer (Wallet team) - 100% remote | Senior | Global remote | Nigeria-eligible | himalayas | https://himalayas.app/companies/tether-operations-limited/jobs/react-native-developer-wallet-team-100-remote |
| Seen | **Cambium Learning Group** | Senior Software Engineer | Senior | Global remote | Nigeria-eligible | himalayas | https://himalayas.app/companies/cambium-learning-group/jobs/senior-software-engineer-513882946 |
| Seen | **Fueled** | Contract Senior Web Engineer | Senior | Global remote | Nigeria-eligible | himalayas | https://himalayas.app/companies/fueled/jobs/contract-senior-web-engineer |
| Seen | **Autopilot** | Product Engineer | Unknown | Global remote | Nigeria-eligible | himalayas | https://himalayas.app/companies/autopilot-is/jobs/product-engineer |
| Seen | **Fueled** | Senior Full Stack Engineer | Senior | Global remote | Nigeria-eligible | himalayas | https://himalayas.app/companies/fueled/jobs/senior-full-stack-engineer |
| Seen | **Axcera** | Lead Full Stack Developer (Industry Experience) | Staff/Lead | Global remote | Nigeria-eligible | himalayas | https://himalayas.app/companies/axcera/jobs/lead-full-stack-developer-industry-experience |
| Seen | **Ruby Labs** | Senior React Native Developer | Staff/Lead | Global remote | Nigeria-eligible | jobicy | https://jobicy.com/jobs/148652-senior-react-native-developer |
| Seen | **LawnStarter** | Staff Product Engineer | Staff/Lead | Global remote | Nigeria-eligible | jobicy | https://jobicy.com/jobs/147510-staff-product-engineer |
| Seen | **LawnStarter** | Staff Product Engineer (Mexico City) | Staff/Lead | Global remote | Nigeria-eligible | remotive | https://remotive.com/remote-jobs/product/staff-product-engineer-mexico-city-2091057 |
| Seen | **LawnStarter** | Staff Product Engineer (Montevideo) | Staff/Lead | Global remote | Nigeria-eligible | remotive | https://remotive.com/remote-jobs/product/staff-product-engineer-montevideo-2091054 |
| Seen | **LawnStarter** | Staff Product Engineer (Campinas) | Staff/Lead | Global remote | Nigeria-eligible | remotive | https://remotive.com/remote-jobs/product/staff-product-engineer-campinas-2091053 |
| Seen | **LawnStarter** | Staff Product Engineer (Belo Horizonte) | Staff/Lead | Global remote | Nigeria-eligible | remotive | https://remotive.com/remote-jobs/product/staff-product-engineer-belo-horizonte-2091052 |
| Seen | **LawnStarter** | Staff Product Engineer (Florianópolis) | Staff/Lead | Global remote | Nigeria-eligible | remotive | https://remotive.com/remote-jobs/product/staff-product-engineer-florianopolis-2091051 |
| Seen | **LawnStarter** | Staff Product Engineer (São Paulo) | Staff/Lead | Global remote | Nigeria-eligible | remotive | https://remotive.com/remote-jobs/product/staff-product-engineer-sao-paulo-2091000 |
| Seen | **Base.com** | Full-Stack Developer (React + AWS) | Staff/Lead | Global remote | Nigeria-eligible | wwr | https://weworkremotely.com/remote-jobs/base-com-full-stack-developer-react-aws |
| Seen | **Sowelo Consulting** | Full Stack Developer | Unknown | Global remote | Nigeria-eligible | wwr | https://weworkremotely.com/remote-jobs/sowelo-consulting-full-stack-developer |
| Seen | **Arize Ai** | Open Source Design Engineer | Unknown | Global remote | Nigeria-eligible | wwr | https://weworkremotely.com/remote-jobs/arize-ai-open-source-design-engineer |
| Seen | **Lemon.io** | Senior React Native Developer | Senior | Global remote | Nigeria-eligible | wwr | https://weworkremotely.com/remote-jobs/lemon-io-senior-react-native-developer |
| Seen | **KAI Partners** | Technical Solutions Engineer/Web Developer | Senior | Global remote | Nigeria-eligible | wwr | https://weworkremotely.com/remote-jobs/kai-partners-technical-solutions-engineer-web-developer |
| Seen | **Proxify AB** | Senior Frontend Developer (React.js / Next.js) | Senior | Global remote | Nigeria-eligible | wwr | https://weworkremotely.com/remote-jobs/proxify-ab-senior-frontend-developer-react-js-next-js-1 |
| Seen | **Proxify AB** | Senior Fullstack Developer (React.js / Node.js) | Senior | Global remote | Nigeria-eligible | wwr | https://weworkremotely.com/remote-jobs/proxify-ab-senior-fullstack-developer-react-js-node-js-2 |
| Seen | **Wonderdog** | Full-Stack Product Engineer - Agentic First | Staff/Lead | Global remote | Nigeria-eligible | wwr | https://weworkremotely.com/remote-jobs/wonderdog-full-stack-product-engineer-agentic-first |
| Seen | **Lemon.io** | Senior React Full-stack Developer | Senior | Global remote | Nigeria-eligible | wwr | https://weworkremotely.com/remote-jobs/lemon-io-senior-react-full-stack-developer-5 |
| Seen | **Khibraty** | Lead Full-stack Developer (Full-Time Remote Contractor) | Staff/Lead | Global remote | Nigeria-eligible | wwr | https://weworkremotely.com/remote-jobs/khibraty-lead-full-stack-developer-full-time-remote-contractor |
| Seen | **Proxify AB** | Senior Fullstack Developer (Python) | Staff/Lead | Global remote | Nigeria-eligible | wwr | https://weworkremotely.com/remote-jobs/proxify-ab-senior-fullstack-developer-python-3 |
| Seen | **Sticker Mule** | Software engineer | Unknown | Global remote | Nigeria-eligible | wwr | https://weworkremotely.com/remote-jobs/sticker-mule-software-engineer-3 |


## All matched — verify geo

Roles with EMEA or unclear remote scope without explicit Nigeria/Africa hire language. Confirm eligibility on the listing before applying.

| Status | Company | Role | Level | Remote | Geo | Source | Apply |
|--------|--------|------|-------|--------|-----|--------|-------|
| Seen | **Kubikware** | Python & React Engineer with AI (Remote, Latam) | Senior | Remote (verify scope) | Verify geo | jobicy | https://jobicy.com/jobs/146122-python-react-engineer-with-ai-remote-latam-2 |
| Seen | **Truelogic** | Senior Full-stack Engineer (Elixir/React) – veterinary software company - (Remote - LATAM) | Staff/Lead | Remote (verify scope) | Verify geo | jobicy | https://jobicy.com/jobs/146276-senior-full-stack-engineer-elixir-react-veterinary-software-company-remote-latam |
| Seen | **Truelogic** | Senior Fullstack Engineer (.NET/React + Umbraco CMS) - Digital Agency | Staff/Lead | Remote (verify scope) | Verify geo | jobicy | https://jobicy.com/jobs/149158-senior-fullstack-engineer-net-react-umbraco-cms-digital-agency |
| Seen | **Truelogic** | Senior Full-stack Engineer (Python/React) - Advertising | Staff/Lead | Remote (verify scope) | Verify geo | jobicy | https://jobicy.com/jobs/149156-senior-full-stack-engineer-python-react-advertising |
| Seen | **Kubikware** | Node.js & React Tech Lead (Latam, Remote) | Staff/Lead | Remote (verify scope) | Verify geo | jobicy | https://jobicy.com/jobs/147980-node-js-react-tech-lead-latam-remote |
| Seen | **Kubikware** | Laravel & React Engineer (Remote, Latam) | Unknown | Remote (verify scope) | Verify geo | jobicy | https://jobicy.com/jobs/147975-laravel-react-engineer-remote-latam |
| Seen | **Kubikware** | Full-Stack Node.js and React Engineer | Staff/Lead | Remote (verify scope) | Verify geo | jobicy | https://jobicy.com/jobs/147974-full-stack-node-js-and-react-engineer |
| Seen | **Kubikware** | Python & React Engineer with AI (Remote, Latam) | Senior | Remote (verify scope) | Verify geo | jobicy | https://jobicy.com/jobs/142967-python-react-engineer-with-ai-remote-latam |
| Seen | **Miro** | Staff Design Engineer | Staff/Lead | EMEA/regional | Verify geo | jobicy | https://jobicy.com/jobs/147065-staff-design-engineer |
| Seen | **Truelogic** | Senior Full-Stack Engineer (TypeScript/AI Automation) - Real Estate - LATAM | Staff/Lead | Remote (verify scope) | Verify geo | jobicy | https://jobicy.com/jobs/146294-senior-full-stack-engineer-typescript-ai-automation-real-estate-latam |
| Seen | **infisical** | Senior Full Stack Engineer | Senior | EMEA/regional | Verify geo | jobicy | https://jobicy.com/jobs/145861-senior-full-stack-engineer-5 |
| Seen | **Automat-it** | Senior Full-Stack Developer | Senior | EMEA/regional | Verify geo | jobicy | https://jobicy.com/jobs/143143-senior-full-stack-developer |
| Seen | **Reddit** | Senior Frontend Software Engineer, Home Experience | Senior | Remote (verify scope) | Verify geo | jobicy | https://jobicy.com/jobs/147496-senior-frontend-software-engineer-home-experience |
| Seen | **Clipster** | Senior Product Engineer (Fullstack) | Senior | EMEA/regional | Verify geo | remotive | https://remotive.com/remote-jobs/software-development/senior-product-engineer-fullstack-2091062 |
| Seen | **HOPn UG** | Frontend Developer Intern (Unpaid) | Junior | Remote (verify scope) | Verify geo | arbeitnow | https://www.arbeitnow.com/jobs/companies/hopn-ug/frontend-developer-intern-unpaid-puchheim-124552 |
| Seen | **easybill GmbH** | Senior Software Engineer Ruby on Rails 100 % remote (m/w/d) | Senior | EMEA/regional | Verify geo | arbeitnow | https://www.arbeitnow.com/jobs/companies/easybill-gmbh/senior-software-engineer-ruby-on-rails-100-remote-willich-63518 |
| Seen | **Atcom** | Senior .NET Web Developer | Senior | Remote (verify scope) | Verify geo | wwr | https://weworkremotely.com/remote-jobs/atcom-senior-net-web-developer |
| Seen | **Wildflower Health** | Junior Software Engineer | Junior | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48748749 |
| Seen | **Sequent Tech** | Senior Fullstack Engineer | Senior | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48749845 |
| Seen | **Distru (<a href="https://www.distru.com" rel="nofollow">https://www.distru.com</a>)** | Senior Software Engineer | Senior | EMEA/regional | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48751006 |
| Seen | **Vistulo** | Sr. Java Backend / Sr. React Frontend / Sr. Network Engineer / Sr. Cloud Infrastructure Engineer | Senior | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48751832 |
| Seen | **Kanary** | Full Stack Engineer | Senior | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48752617 |
| Seen | **AveryIQ (YC W24)** | Staff Software Engineer | Staff/Lead | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48753025 |
| Seen | **Opendate** | Senior Full-Stack Software Engineer | Senior | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48755090 |
| Seen | **Dashdoc** | Product/Software Engineer, BeNeLux Expansion | Unknown | EMEA/regional | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48756639 |
| Seen | **ProxyBase (<a href="https://proxybase.xyz" rel="nofollow">https://proxybase.xyz</a>)** | Rust Backend Engineers & Full-Stack Developers | Unknown | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48756786 |
| Seen | **Logen.io** | Founding Full-stack / AI Engineer | Unknown | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48760654 |
| Seen | **Makeship** | Senior Software Engineer + Staff Engineer (Systems & Integrations) | Staff/Lead | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48761138 |
| Seen | **Vertex Inc <a href="https://www.vertexinc.com/" rel="nofollow">https://www.vertexinc.com/</a>** | AI Product Engineer | Unknown | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48762195 |
| Seen | **DrSwarm** | Founding Engineer (Full-Stack) | Unknown | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48765345 |
| Seen | **Featurebase** | Full-stack Product Engineer | Unknown | EMEA/regional | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48772824 |
| Seen | **Rivet** | Fullstack engineer | Unknown | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48806120 |
| Seen | **Rabbet (YC S17)** | Sr. Software Engineer (Elixir/React) | Unknown | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48819370 |
| Seen | **Trinsic** | Senior Product Engineer | Senior | EMEA/regional | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48837669 |
| Seen | **LightSight** | Forward Deployed Software Engineer (multiple levels) | Senior | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48838599 |
| Seen | **Zeitlabs** | Senior Frontend Engineer | Senior | Remote (verify scope) | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48842567 |
| Seen | **Orbit** | Product Engineer | Unknown | EMEA/regional | Verify geo | hn-hiring | https://news.ycombinator.com/item?id=48904087 |


---

## Source stats

| Source | Fetched | Quarantined | Matched | Status |
|--------|--------:|------------:|--------:|--------|
| himalayas (himalayas) | 12 | 0 | 10 | OK |
| remotive (remotive) | 41 | 0 | 7 | OK |
| jobicy (jobicy) | 78 | 0 | 15 | OK |
| remoteok (remoteok) | 0 | 101 | 0 | OK |
| wwr (wwr) | 51 | 0 | 13 | OK |
| arbeitnow (arbeitnow) | 300 | 0 | 2 | OK |
| hn-hiring (hn-hiring) | 113 | 0 | 20 | OK |


---

## Scan stats

| Metric | Count |
|--------|------:|
| Total matched (after filters) | 67 |
| — Nigeria-eligible | 30 |
| — Verify geo | 37 |
| New this run | **0** |
| Previously seen (still open) | 67 |
| Excluded by filter | 524 |
| Blocklisted employers | 4 |
| Source fetch errors | 0 |

---

## Fetch errors

_None._

---

## Excluded sample (first 15)

Includes likely geo exclusions (EU/UK/US-only, hybrid, Africa excluded) and non-frontend roles.

- Medallion — Software Engineer: Not React/frontend focused
- Orion Innovation — Full Stack Developer: Geo restriction: EU/UK/US/hybrid/on-site signals in listing
- Numentica — Frontend Engineer React and AWS: Geo restriction: EU/UK/US/hybrid/on-site signals in listing
- Truelogic — Graphic Designer - Marketing: Not React/frontend focused
- Alan — Engineering Manager hands on (x/f/m) - Growth Product: Not React/frontend focused
- Truelogic — Hands-On Tech Lead – PropTech & Real Estate Media: Not React/frontend focused
- Sigma Computing — Customer Success Architect: Not React/frontend focused
- Remote — Product Manager: Not React/frontend focused
- Remote — Product Manager, Fraud and Compliance: Not React/frontend focused
- Varicent — Staff Software Developer: Not React/frontend focused
- Supabase — Support Engineering Manager (APAC): Not React/frontend focused
- Dayforce — Software Developer Sr. - AI-Native .NET/ Azure (Cloud Platform): Not React/frontend focused
- Truelogic — Senior Full-Stack Engineer (.NET/Angular) (ASP.NET Focus) - GovTech / HR Software - LATAM: Not React/frontend focused
- Sonatype — Customer Success Manager: Not React/frontend focused
- refurbed — Senior Product Designer (Customer Success) (f/m/x): Not React/frontend focused

---

## New listings — mark applied

Tick boxes after applying; the next `pnpm scan-jobs` run merges checked items into `~/.config/refine-cv/applied-jobs.json`.

_No new listings this run._


*Generated by refine-cv job scan pipeline.*
