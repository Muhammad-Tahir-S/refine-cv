import { mkdirSync } from "node:fs";
import { chromium, type BrowserContext } from "playwright";

const MACOS_CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export interface ChromeContextOptions {
  userDataDir: string;
  headed?: boolean;
}

function chromeLaunchOptions(headed: boolean) {
  return {
    headless: !headed,
    channel: "chrome",
    executablePath: process.platform === "darwin" ? MACOS_CHROME_PATH : undefined,
  };
}

export async function launchChromeContext(
  options: ChromeContextOptions,
): Promise<BrowserContext> {
  mkdirSync(options.userDataDir, { recursive: true });
  const headed = options.headed ?? true;
  const launchOptions = chromeLaunchOptions(headed);

  try {
    return await chromium.launchPersistentContext(options.userDataDir, launchOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("channel") || message.includes("Executable")) {
      throw new Error(
        "Google Chrome is required for LinkedIn browser automation (not Safari or bundled Chromium). " +
          "Install Google Chrome, then run: pnpm setup:linkedin",
        { cause: error },
      );
    }

    throw error;
  }
}
