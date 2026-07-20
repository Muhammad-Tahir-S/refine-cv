import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { type BrowserContext, type Page, type Response } from "playwright";
import { paths } from "../paths.js";
import { launchChromeContext } from "./browser.js";
import { isBlocklisted, normalizeCompanyName } from "./dedupe.js";
import { loadBlocklistAt } from "./scan-policy.js";
import type { RoleProfile } from "./role-profile.js";
import {
  buildLinkedInSearchUrl,
  filterByLinkedInRoleProfile,
  LINKEDIN_DEFAULT_EXPERIENCE_LEVELS,
  LINKEDIN_DEFAULT_KEYWORDS,
  parseExperienceLevels,
  resolveMaxPages,
} from "./linkedin-options.js";
import {
  LINKEDIN_DISCOVERY_STATE_PATH,
  LINKEDIN_PROFILE_DIR,
} from "./state.js";
import {
  buildVoyagerDetailUrls,
  companyFromApplyUrl,
  isVoyagerJobCardsResponse,
  parseVoyagerJobDetailPayload,
  parseVoyagerSearchPayloads,
  type VoyagerSearchHit,
} from "./voyager.js";

export interface LinkedInDiscoveryOptions {
  maxPages?: number;
  headed?: boolean;
  force?: boolean;
  keywords?: string;
  experienceLevels?: string;
  configPath?: string;
  outputPath?: string;
  skipDiscoveryState?: boolean;
  roleProfile?: RoleProfile;
}

export interface LinkedInDiscoveryHit {
  company: string;
  title: string;
  linkedinUrl: string;
  externalApplyUrl?: string;
  easyApplyOnly?: boolean;
}

export interface LinkedInDiscoveryStats {
  pagesRequested: number;
  pagesScanned: number;
  rawHits: number;
  enrichedHits: number;
  withExternalApply: number;
  easyApplyOnly: number;
  eligibleJobs: number;
  blocklisted: number;
  detailFetches: number;
}

export interface LinkedInDiscoveryResult {
  outputPath: string;
  hits: LinkedInDiscoveryHit[];
  stats: LinkedInDiscoveryStats;
}

interface LinkedInDiscoveryState {
  lastRunAt: string | null;
}

const LIST_SCROLL_SELECTOR =
  ".jobs-search-results-list, .scaffold-layout__list";
const JOB_CARD_SELECTOR = ".job-card-container";

function resolveOutputPath(explicit?: string): string {
  if (explicit) {
    return explicit;
  }
  return join(
    paths.jobsDir,
    `${new Date().toISOString().slice(0, 10)}-job-scan`,
    "linkedin-discovery.md",
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  return sleep(ms);
}

function loadDiscoveryState(): LinkedInDiscoveryState {
  if (!existsSync(LINKEDIN_DISCOVERY_STATE_PATH)) {
    return { lastRunAt: null };
  }
  return JSON.parse(
    readFileSync(LINKEDIN_DISCOVERY_STATE_PATH, "utf8"),
  ) as LinkedInDiscoveryState;
}

function saveDiscoveryState(state: LinkedInDiscoveryState): void {
  mkdirSync(join(LINKEDIN_PROFILE_DIR, ".."), { recursive: true });
  writeFileSync(
    LINKEDIN_DISCOVERY_STATE_PATH,
    `${JSON.stringify(state, null, 2)}\n`,
  );
}

function createVoyagerSearchCapture(): {
  handler: (response: Response) => void;
  getPayloads: () => unknown[];
  reset: () => void;
} {
  const payloads: unknown[] = [];

  const handler = (response: Response): void => {
    void (async () => {
      if (!isVoyagerJobCardsResponse(response.url())) {
        return;
      }
      try {
        const json = await response.json();
        payloads.push(json);
      } catch {
        // ignore parse failures
      }
    })();
  };

  return {
    handler,
    getPayloads: () => [...payloads],
    reset: () => {
      payloads.length = 0;
    },
  };
}

async function isLoginWall(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes("/login") || url.includes("/checkpoint")) {
    return true;
  }
  const signIn = await page
    .locator("text=Sign in")
    .first()
    .isVisible()
    .catch(() => false);
  const joinNow = await page
    .locator("text=Join now")
    .first()
    .isVisible()
    .catch(() => false);
  return signIn && joinNow;
}

async function scrollJobList(page: Page): Promise<void> {
  await page.evaluate(async (listSelector) => {
    const selectors = listSelector.split(",").map((s) => s.trim());
    let container: Element | null = null;
    for (const sel of selectors) {
      container = document.querySelector(sel);
      if (container) {
        break;
      }
    }

    const scrollTarget = container ?? document.documentElement;
    for (let i = 0; i < 4; i += 1) {
      scrollTarget.scrollTop = scrollTarget.scrollHeight;
      await new Promise((r) => setTimeout(r, 800));
    }
  }, LIST_SCROLL_SELECTOR);
}

async function getCsrfToken(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies("https://www.linkedin.com");
  const session = cookies.find((cookie) => cookie.name === "JSESSIONID");
  return (session?.value ?? "").replace(/"/g, "");
}

async function fetchJobApplyInfo(
  page: Page,
  csrf: string,
  jobId: string,
): Promise<{
  externalApplyUrl?: string;
  easyApplyOnly: boolean;
  company?: string;
}> {
  const urls = buildVoyagerDetailUrls(jobId);

  return page
    .evaluate(
      async ({ detailUrls, csrfToken }) => {
        for (const url of detailUrls) {
          try {
            const response = await fetch(url, {
              headers: {
                "csrf-token": csrfToken,
                accept: "application/vnd.linkedin.normalized+json+2.1",
              },
            });
            if (!response.ok) {
              continue;
            }
            return await response.json();
          } catch {
            // try next endpoint
          }
        }
        return null;
      },
      { detailUrls: urls, csrfToken: csrf },
    )
    .then((payload) => parseVoyagerJobDetailPayload(payload));
}

async function extractSearchHitsFromDom(
  page: Page,
): Promise<VoyagerSearchHit[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".job-card-container"));
    const hits: Array<{
      jobId: string;
      title: string;
      company: string;
      linkedinUrl: string;
    }> = [];

    for (const card of cards) {
      const link = card.querySelector(
        "a[href*='/jobs/view/']",
      ) as HTMLAnchorElement | null;
      const href = link?.href ?? "";
      const jobId = href.match(/jobs\/view\/(\d+)/)?.[1];
      const title =
        card
          .querySelector(".job-card-list__title, .artdeco-entity-lockup__title")
          ?.textContent?.trim() ?? "";
      const company =
        card
          .querySelector(
            ".job-card-container__company-name, .artdeco-entity-lockup__subtitle",
          )
          ?.textContent?.trim() ?? "";

      if (jobId && title) {
        hits.push({
          jobId,
          title,
          company: company || "Unknown",
          linkedinUrl: `https://www.linkedin.com/jobs/view/${jobId}/`,
        });
      }
    }

    return hits;
  });
}

async function mergeCompanyNamesFromDom(
  page: Page,
  hits: VoyagerSearchHit[],
): Promise<VoyagerSearchHit[]> {
  const domHits = await extractSearchHitsFromDom(page);
  const byJobId = new Map(domHits.map((hit) => [hit.jobId, hit.company]));

  return hits.map((hit) => ({
    ...hit,
    company:
      hit.company === "Unknown"
        ? (byJobId.get(hit.jobId) ?? hit.company)
        : hit.company,
  }));
}

function dedupeSearchHits(hits: VoyagerSearchHit[]): VoyagerSearchHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.jobId)) {
      return false;
    }
    seen.add(hit.jobId);
    return true;
  });
}

async function collectSearchPageHits(
  page: Page,
  capture: ReturnType<typeof createVoyagerSearchCapture>,
): Promise<VoyagerSearchHit[]> {
  await page.waitForSelector(`${JOB_CARD_SELECTOR}, ${LIST_SCROLL_SELECTOR}`, {
    timeout: 20000,
  });
  await scrollJobList(page);
  await randomDelay(1500, 2500);

  let hits = dedupeSearchHits(
    parseVoyagerSearchPayloads(capture.getPayloads()),
  );

  if (hits.length === 0) {
    hits = await extractSearchHitsFromDom(page);
  } else {
    hits = await mergeCompanyNamesFromDom(page, hits);
  }

  return dedupeSearchHits(hits);
}

async function enrichSearchHits(
  page: Page,
  context: BrowserContext,
  searchHits: VoyagerSearchHit[],
): Promise<{ hits: LinkedInDiscoveryHit[]; detailFetches: number }> {
  const csrf = await getCsrfToken(context);
  const enriched: LinkedInDiscoveryHit[] = [];
  let detailFetches = 0;

  for (const searchHit of searchHits) {
    await randomDelay(400, 900);
    const applyInfo = await fetchJobApplyInfo(page, csrf, searchHit.jobId);
    detailFetches += 1;

    enriched.push({
      company: (() => {
        if (searchHit.company !== "Unknown" && searchHit.company) {
          return searchHit.company;
        }
        if (applyInfo.company) {
          return applyInfo.company;
        }
        if (applyInfo.externalApplyUrl) {
          return (
            companyFromApplyUrl(applyInfo.externalApplyUrl) ?? searchHit.company
          );
        }
        return searchHit.company;
      })(),
      title: searchHit.title,
      linkedinUrl: searchHit.linkedinUrl,
      externalApplyUrl: applyInfo.externalApplyUrl,
      easyApplyOnly: applyInfo.easyApplyOnly && !applyInfo.externalApplyUrl,
    });
  }

  return { hits: enriched, detailFetches };
}

async function launchLinkedInContext(headed: boolean) {
  return launchChromeContext({
    userDataDir: LINKEDIN_PROFILE_DIR,
    headed,
  });
}

async function waitForEnter(prompt: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

export async function runLinkedInLogin(): Promise<void> {
  const context = await launchLinkedInContext(true);

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://www.linkedin.com/login", {
    waitUntil: "domcontentloaded",
  });

  console.log("\nLinkedIn login window opened.");
  console.log("1. Sign in manually (including 2FA if prompted).");
  console.log("2. Navigate to Jobs search once logged in.");
  console.log("3. Press Enter in this terminal when done.\n");

  await waitForEnter("Press Enter after you are logged in: ");

  await context.close();
  console.log(`Session saved in ${LINKEDIN_PROFILE_DIR}`);
}

export async function runLinkedInDiscovery(
  options: LinkedInDiscoveryOptions = {},
): Promise<LinkedInDiscoveryResult> {
  const maxPages = resolveMaxPages(options.maxPages ?? 3);
  const headed = options.headed ?? true;
  const force = options.force ?? false;
  const skipDiscoveryState = options.skipDiscoveryState ?? false;
  const keywords = options.keywords ?? LINKEDIN_DEFAULT_KEYWORDS;
  const experienceLevels = parseExperienceLevels(
    options.experienceLevels ?? LINKEDIN_DEFAULT_EXPERIENCE_LEVELS,
  );
  const roleProfile = options.roleProfile ?? "reactFrontend";
  const outputPath = resolveOutputPath(options.outputPath);
  const blocklist = loadBlocklistAt(options.configPath);

  if (!skipDiscoveryState && !force) {
    const prior = loadDiscoveryState();
    if (prior.lastRunAt) {
      const last = new Date(prior.lastRunAt).getTime();
      const hoursSince = (Date.now() - last) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        throw new Error(
          `LinkedIn discovery already ran ${hoursSince.toFixed(1)}h ago. Max one run per day. Use --force to override.`,
        );
      }
    }
  }

  mkdirSync(LINKEDIN_PROFILE_DIR, { recursive: true });

  const context = await launchLinkedInContext(headed);
  const page = context.pages()[0] ?? (await context.newPage());
  const collectedSearchHits: VoyagerSearchHit[] = [];
  const seenJobIds = new Set<string>();
  let pagesScanned = 0;
  const perPageCounts: number[] = [];

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
      const capture = createVoyagerSearchCapture();
      page.on("response", capture.handler);

      await page.goto(
        buildLinkedInSearchUrl({
          page: pageNum,
          keywords,
          experienceLevels,
        }),
        {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        },
      );
      await randomDelay(2000, 4000);

      if (await isLoginWall(page)) {
        throw new Error(
          "Login wall detected. Run `pnpm linkedin:login` and sign in again.",
        );
      }

      const searchHits = dedupeSearchHits(
        await collectSearchPageHits(page, capture),
      );
      page.off("response", capture.handler);
      perPageCounts.push(searchHits.length);
      pagesScanned += 1;

      for (const hit of searchHits) {
        if (!seenJobIds.has(hit.jobId)) {
          seenJobIds.add(hit.jobId);
          collectedSearchHits.push(hit);
        }
      }

      if (searchHits.length === 0) {
        break;
      }

      await randomDelay(2500, 5000);
    }

    if (collectedSearchHits.length === 0) {
      throw new Error(
        "Extracted 0 jobs from LinkedIn Voyager/search. Session may have expired or API shape changed. Run `pnpm linkedin:login` and retry.",
      );
    }

    const roleFilteredSearchHits = filterByLinkedInRoleProfile(
      collectedSearchHits,
      roleProfile,
    );

    const { hits: enrichedHits, detailFetches: totalDetailFetches } =
      await enrichSearchHits(page, context, roleFilteredSearchHits);

    const allHits: LinkedInDiscoveryHit[] = [];
    const seen = new Set<string>();

    for (const hit of enrichedHits) {
      const key = `${normalizeCompanyName(hit.company)}::${hit.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        allHits.push(hit);
      }
    }

    const withExternal = allHits.filter((hit) => hit.externalApplyUrl);
    const easyApplyOnly = allHits.filter(
      (hit) => hit.easyApplyOnly && !hit.externalApplyUrl,
    );
    const eligible = withExternal.filter(
      (hit) => !isBlocklisted(hit.company, blocklist),
    );
    const blocklisted = withExternal.length - eligible.length;

    const stats: LinkedInDiscoveryStats = {
      pagesRequested: maxPages,
      pagesScanned,
      rawHits: collectedSearchHits.length,
      enrichedHits: roleFilteredSearchHits.length,
      withExternalApply: withExternal.length,
      easyApplyOnly: easyApplyOnly.length,
      eligibleJobs: eligible.length,
      blocklisted,
      detailFetches: totalDetailFetches,
    };

    const perPageLine = perPageCounts
      .map((count, index) => `  - Page ${index + 1}: ${count} jobs`)
      .join("\n");

    const lines: string[] = [
      "# LinkedIn discovery",
      "",
      `**Run date:** ${new Date().toISOString()}`,
      `**Keywords:** ${keywords}`,
      `**Experience (f_E):** ${experienceLevels}`,
      `**Role profile:** ${roleProfile}`,
      `**Pages requested:** ${maxPages}`,
      `**Pages scanned:** ${pagesScanned}`,
      `**Jobs extracted (Voyager):** ${collectedSearchHits.length}`,
      `**After role filter:** ${roleFilteredSearchHits.length}`,
      `**Detail API fetches:** ${totalDetailFetches}`,
      `**With external apply URL:** ${withExternal.length}`,
      `**Easy Apply only (skipped):** ${easyApplyOnly.length}`,
      `**Eligible after blocklist:** ${eligible.length}`,
      `**Blocklisted:** ${blocklisted}`,
      "",
      "## Per-page extraction",
      "",
      perPageLine || "_No pages scanned._",
      "",
      "## External-apply listings (blocklist filtered)",
      "",
    ];

    for (const hit of eligible) {
      lines.push(
        `- **${hit.company}** — ${hit.title}`,
        `  - LinkedIn: ${hit.linkedinUrl}`,
        `  - Apply: ${hit.externalApplyUrl}`,
        "",
      );
    }

    if (eligible.length === 0) {
      lines.push("_No eligible external-apply listings this run._");
      if (withExternal.length > 0) {
        lines.push("", "## Blocklisted external apply (sample)", "");
        for (const hit of withExternal
          .filter((entry) => isBlocklisted(entry.company, blocklist))
          .slice(0, 10)) {
          lines.push(
            `- ${hit.company} — ${hit.title} — ${hit.externalApplyUrl}`,
          );
        }
      }
      if (easyApplyOnly.length > 0) {
        lines.push("", "## Easy Apply only (sample)", "");
        for (const hit of easyApplyOnly.slice(0, 10)) {
          lines.push(`- ${hit.company} — ${hit.title}`);
        }
      }
    }

    mkdirSync(join(outputPath, ".."), { recursive: true });
    writeFileSync(outputPath, `${lines.join("\n")}\n`);

    if (!skipDiscoveryState) {
      saveDiscoveryState({ lastRunAt: new Date().toISOString() });
    }

    return { outputPath, hits: eligible, stats };
  } finally {
    await context.close();
  }
}
