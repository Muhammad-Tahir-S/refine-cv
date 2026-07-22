# Session-required job boards (future backlog)

These boards are **not implemented** in the board-first scan. They require authenticated browser sessions, anti-bot handling, or explicit permission. Implement in a separate session using the LinkedIn pattern (`browser.ts` + saved Chrome profile + low daily volume).

## Prerequisites for any Tier B integration

- Review terms of service and permission to automate
- Persist session cookies in `~/.config/refine-cv/<board>-profile/`
- Cap volume (1–3 pages or equivalent per day)
- Handle CAPTCHA/login walls gracefully
- Do not extend to Indeed/Glassdoor unless risk is explicitly accepted

## Backlog

| Board | Why session/auth | Notes |
|-------|------------------|-------|
| LinkedIn | Already built (`pnpm linkedin:login`, `pnpm discover-linkedin`) | Voyager API + Playwright Chrome; ToS risk; external-apply only |
| Wellfound (AngelList) | GraphQL behind login | Good startup signal; medium effort |
| Otta / Welcome to the Jungle | Personalized feed behind login | UK/EU lean; fragile scraping |
| Indeed | Aggressive bot detection, no public API | High block risk; low ROI for Nigeria remote FE |
| Glassdoor | Login wall for most listings | ToS + CAPTCHA |
| Dice | US-centric aggregator, anti-scrape | Low ROI for target profile |
| ZipRecruiter | US-centric aggregator, anti-scrape | Low ROI for target profile |

## Recommendation

Complete and rely on public board coverage first (`pnpm scan-jobs`). Add optional Tier B sources only if gaps remain after several weekly runs, starting with Wellfound if startup density is insufficient.
