import * as fs from "node:fs";
import * as path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { openNcltBrowser } from "../routes/automation/core/browser";

async function main(): Promise<void> {
  const [
    ,
    ,
    bench = "chennai",
    caseType = "26",
    caseNumber = "356",
    year = "2019",
  ] = process.argv;

  const session = await openNcltBrowser(false);

  try {
    const { page } = session;
    const outputDir = path.join(process.cwd(), "output");
    fs.mkdirSync(outputDir, { recursive: true });

    await page.goto("https://nclt.gov.in/order-cp-wise", {
      waitUntil: "domcontentloaded",
    });

    await page.locator("#bench").selectOption(bench);
    await page.locator("#case_type").selectOption(caseType);
    await page.locator("#cpno").fill(caseNumber);
    await page.locator("#year").selectOption(year);

    console.log(
      "Complete the CAPTCHA in the opened browser, then return here and press Enter.",
    );

    const readline = createInterface({ input: stdin, output: stdout });
    await readline.question("Press Enter after completing the CAPTCHA...");
    readline.close();

    const captchaValue = await page.locator("#txtInput").inputValue();

    if (!captchaValue.trim()) {
      throw new Error(
        "The CAPTCHA field is empty. Enter it in the browser and try again.",
      );
    }

    const navigation = page
      .waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 15000,
      })
      .catch(() => null);

    await page.locator("#txtInput").evaluate((input) => {
      const form = input.closest("form");

      if (!form) {
        throw new Error(
          "Could not find the form containing the CAPTCHA field.",
        );
      }

      (form as HTMLFormElement).requestSubmit();
    });

    await navigation;
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    const result = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      pageText: document.body.innerText.slice(0, 12000),
      links: Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
        .map((link) => ({
          text: link.textContent?.replace(/\s+/g, " ").trim() ?? "",
          href: link.href,
        }))
        .filter((link) => link.text || /\.pdf(?:$|[?#])/i.test(link.href))
        .slice(0, 150),
    }));

    console.log("Order search results:");
    console.log(JSON.stringify(result, null, 2));

    await page.screenshot({
      path: path.join(outputDir, "nclt-order-search-results.png"),
      fullPage: true,
    });

    const caseDetailsLink = result.links.find(
      (link) =>
        link.text.trim().toLowerCase() === "pending" &&
        link.href.includes("/case-details"),
    );

    if (!caseDetailsLink) {
      console.log("No case-details link was found for the matching result.");
      return;
    }

    await page.goto(caseDetailsLink.href, {
      waitUntil: "domcontentloaded",
    });

    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => {});

    const caseDetails = await page.evaluate(() => {
      const orderDocuments = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("a[href]"),
      )
        .filter(
          (link) =>
            /view pdf/i.test(link.textContent ?? "") ||
            /gen_pdf\.php/i.test(link.href),
        )
        .map((link) => {
          const container =
            link.closest("tr") ??
            link.closest(".views-row") ??
            link.parentElement?.parentElement;

          return {
            label: link.textContent?.replace(/\s+/g, " ").trim() ?? "",
            url: link.href,
            surroundingText:
              container?.textContent?.replace(/\s+/g, " ").trim() ?? "",
          };
        });

      const tables = Array.from(
        document.querySelectorAll<HTMLTableElement>("table"),
      ).map((table) => ({
        headers: Array.from(table.querySelectorAll("th")).map(
          (cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "",
        ),
        rows: Array.from(table.querySelectorAll("tr")).map((row) =>
          Array.from(row.querySelectorAll("th, td")).map(
            (cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "",
          ),
        ),
      }));

      return {
        title: document.title,
        url: location.href,
        pageText: document.body.innerText.slice(0, 12000),
        tables,
        orderDocuments,
      };
    });

    console.log("Case details:");
    console.log(JSON.stringify(caseDetails, null, 2));

    await page.screenshot({
      path: path.join(outputDir, "nclt-case-order-details.png"),
      fullPage: true,
    });

    console.log("Search and case details screenshots saved in output/");
  } finally {
    await session.close();
  }
}

main().catch((error: unknown) => {
  console.error("NCLT order search failed:", error);
  process.exitCode = 1;
});
