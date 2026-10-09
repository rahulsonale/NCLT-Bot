import * as fs from "node:fs";
import * as path from "node:path";
import { openNcltBrowser } from "../routes/automation/core/browser";

async function main(): Promise<void> {
  const session = await openNcltBrowser(false);

  try {
    const { page } = session;

    await page.goto("https://nclt.gov.in/order-cp-wise", {
      waitUntil: "domcontentloaded",
    });

    const pageInfo = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll("select")).map(
        (select) => ({
          id: select.id,
          name: select.name,
          options: Array.from(select.options).map((option) => ({
            text: option.textContent?.trim(),
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
          labels: Array.from(input.labels ?? []).map((label) =>
            label.innerText.trim(),
          ),
        }),
      );

      const buttons = Array.from(
        document.querySelectorAll("button, input[type='submit']"),
      ).map((button) => ({
        text: button.textContent?.trim(),
        value: (button as HTMLInputElement).value,
        id: (button as HTMLElement).id,
        name: (button as HTMLButtonElement).name,
      }));

      const pdfLinks = Array.from(document.querySelectorAll("a[href]"))
        .map((link) => link as HTMLAnchorElement)
        .filter((link) => /\.pdf(?:$|[?#])/i.test(link.href))
        .map((link) => ({
          text: link.innerText.trim(),
          href: link.href,
        }));

      return {
        title: document.title,
        url: location.href,
        selects,
        inputs,
        buttons,
        pdfLinks,
        pageText: document.body.innerText.slice(0, 8000),
      };
    });

    console.log(JSON.stringify(pageInfo, null, 2));

    const outputDir = path.join(process.cwd(), "output");
    fs.mkdirSync(outputDir, { recursive: true });

    await page.screenshot({
      path: path.join(outputDir, "nclt-orders-search-page.png"),
      fullPage: true,
    });

    console.log("Orders search screenshot saved in output/");
  } finally {
    await session.close();
  }
}

main().catch((error: unknown) => {
  console.error("NCLT orders inspection failed:", error);
  process.exitCode = 1;
});
