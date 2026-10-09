import * as fs from "node:fs";
import * as path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { openNcltBrowser } from "../routes/automation/core/browser";
import { createHash } from "node:crypto";

interface SavedOrderRecord {
  listingDate: string | null;
  sourceUrl: string;
  fileName: string | null;
  sha256: string | null;
  status: "downloaded" | "duplicate" | "error";
  duplicateOf?: string;
  error?: string;
}

function isOfficialNcltUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      (hostname === "nclt.gov.in" || hostname.endsWith(".nclt.gov.in"))
    );
  } catch {
    return false;
  }
}

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

    const caseFolder = `${bench}-${caseType}-${caseNumber}-${year}`.replace(
      /[^a-z0-9_-]/gi,
      "_",
    );
    const ordersDir = path.join(outputDir, "orders", caseFolder);
    fs.mkdirSync(ordersDir, { recursive: true });

    const manifestPath = path.join(ordersDir, "manifest.json");
    let manifest: SavedOrderRecord[] = [];

    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf8"),
      ) as SavedOrderRecord[];
    }

    for (const [index, order] of caseDetails.orderDocuments.entries()) {
      const previousRecord = manifest.find(
        (record) => record.sourceUrl === order.url,
      );

      if (
        previousRecord &&
        previousRecord.status !== "error" &&
        previousRecord.fileName &&
        fs.existsSync(path.join(ordersDir, previousRecord.fileName))
      ) {
        console.log(`Already downloaded; skipping ${order.url}`);
        continue;
      }

      const listingDate =
        order.surroundingText.match(/\b\d{2}-\d{2}-\d{4}\b/)?.[0] ?? null;
      const sequence =
        order.surroundingText.match(/^\s*(\d+)/)?.[1] ?? String(index + 1);

      try {
        if (!isOfficialNcltUrl(order.url)) {
          throw new Error("Order URL is outside the official NCLT domain.");
        }

        const response = await fetch(order.url, { redirect: "follow" });

        if (!isOfficialNcltUrl(response.url)) {
          throw new Error("The order URL redirected outside the NCLT domain.");
        }

        if (!response.ok) {
          throw new Error(`Download failed with status ${response.status}.`);
        }

        const pdfData = Buffer.from(await response.arrayBuffer());

        if (pdfData.subarray(0, 5).toString("ascii") !== "%PDF-") {
          throw new Error("The downloaded document is not a valid PDF.");
        }

        const sha256 = createHash("sha256").update(pdfData).digest("hex");
        const duplicate = manifest.find((record) => record.sha256 === sha256);

        const dateForFile = listingDate
          ? listingDate.replace(/^(\d{2})-(\d{2})-(\d{4})$/, "$3-$2-$1")
          : "unknown-date";

        const fileName =
          duplicate?.fileName ??
          `${sequence.padStart(2, "0")}_${dateForFile}.pdf`;

        if (!duplicate) {
          fs.writeFileSync(path.join(ordersDir, fileName), pdfData);
        }

        const record: SavedOrderRecord = {
          listingDate,
          sourceUrl: order.url,
          fileName,
          sha256,
          status: duplicate ? "duplicate" : "downloaded",
          ...(duplicate ? { duplicateOf: duplicate.sourceUrl } : {}),
        };

        const existingIndex = manifest.findIndex(
          (item) => item.sourceUrl === order.url,
        );

        if (existingIndex >= 0) {
          manifest[existingIndex] = record;
        } else {
          manifest.push(record);
        }

        fs.writeFileSync(
          manifestPath,
          JSON.stringify(manifest, null, 2),
          "utf8",
        );
        console.log(`${record.status}: ${fileName}`);
      } catch (error) {
        const record: SavedOrderRecord = {
          listingDate,
          sourceUrl: order.url,
          fileName: null,
          sha256: null,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        };

        const existingIndex = manifest.findIndex(
          (item) => item.sourceUrl === order.url,
        );

        if (existingIndex >= 0) {
          manifest[existingIndex] = record;
        } else {
          manifest.push(record);
        }

        fs.writeFileSync(
          manifestPath,
          JSON.stringify(manifest, null, 2),
          "utf8",
        );
        console.error(`Failed to download order ${index + 1}:`, record.error);
      }
    }

    console.log(`Order PDFs and manifest saved in ${ordersDir}`);

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
