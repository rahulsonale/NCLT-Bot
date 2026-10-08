import { Browser, BrowserContext, chromium, Page } from "playwright";

export interface NcltBrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

export async function openNcltBrowser(
  headless = process.env.HEADED !== "1",
): Promise<NcltBrowserSession> {
  const browser = await chromium.launch({ headless });

  try {
    const context = await browser.newContext({
      locale: "en-IN",
      viewport: { width: 1366, height: 900 },
    });

    context.setDefaultTimeout(30_000);
    context.setDefaultNavigationTimeout(60_000);

    const page = await context.newPage();

    return {
      browser,
      context,
      page,
      async close() {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
      },
    };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}
