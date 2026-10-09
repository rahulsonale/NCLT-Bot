import * as fs from "fs";
import * as path from "path";
import { openNcltBrowser } from "../routes/automation/core/browser";

async function main(): Promise<void> {
  const session = await openNcltBrowser(false);

  try {
    const { page } = session;

    await page.goto("https://nclt.gov.in/all-cause-list", {
      waitUntil: "domcontentloaded",
    });

    await page.locator("table").first().waitFor({ state: "visible" });

    const pageInfo = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll("select")).map(
        (select) => ({
          id: select.id,
          name: select.getAttribute("name"),
          options: Array.from(select.options).map((option) => ({
            text: option.textContent?.trim(),
            label: option.label,
            value: option.value,
          })),
        }),
      );

      const inputs = Array.from(document.querySelectorAll("input")).map(
        (input) => ({
          type: input.type,
          id: input.id,
          name: input.name,
          placeholder: input.placeholder,
        }),
      );

      const pdfLinks = Array.from(document.querySelectorAll("a[href]"))
        .map((link) => link as HTMLAnchorElement)
        .filter((link) => /\.pdf(?:$|[?#])/i.test(link.href))
        .map((link) => ({
          text: link.innerText.trim(),
          href: link.href,
        }));

      const firstTable = document.querySelector("table");
      const tableHeaders = firstTable
        ? Array.from(firstTable.querySelectorAll("th")).map((cell) =>
            cell.innerText.replace(/\s+/g, " ").trim(),
          )
        : [];

      return { selects, inputs, tableHeaders, pdfLinks };
    });

    console.log(JSON.stringify(pageInfo, null, 2));

    const outputDir = path.join(process.cwd(), "output");
    fs.mkdirSync(outputDir, { recursive: true });
    await page.screenshot({
      path: path.join(outputDir, "nclt-cause-list-page.png"),
      fullPage: true,
    });

    console.log("Cause-list screenshot saved in output/");
  } finally {
    await session.close();
  }
}

main().catch((error: unknown) => {
  console.error("Cause-list inspection failed:", error);
  process.exitCode = 1;
});
