import * as fs from "fs";
import * as path from "path";
import { openNcltBrowser } from "../routes/automation/core/browser";

async function main(): Promise<void> {
  const session = await openNcltBrowser(false);

  try {
    const { page } = session;

    await page.goto(
      "https://efiling.nclt.gov.in/casehistorybeforeloginmenutrue.drt",
      { waitUntil: "domcontentloaded" },
    );

    const selects = page.locator("select");
    await selects.first().waitFor({ state: "visible" });
    await selects.first().selectOption({ label: "Case Number" });

    // Allow the form's conditional fields to update after selecting the search type.
    await page.waitForTimeout(1000);

    const formDetails = await page.evaluate(() => {
      const selectDetails = Array.from(document.querySelectorAll("select")).map(
        (select, index) => ({
          index,
          id: select.id,
          name: select.getAttribute("name"),
          labels: Array.from(select.labels ?? []).map((label) =>
            label.innerText.trim(),
          ),
          options: Array.from(select.options).map((option) => ({
            text: option.text.trim(),
            value: option.value,
          })),
        }),
      );

      const inputDetails = Array.from(document.querySelectorAll("input")).map(
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

      return { selectDetails, inputDetails };
    });

    console.log(JSON.stringify(formDetails, null, 2));

    const outputDir = path.join(process.cwd(), "output");
    fs.mkdirSync(outputDir, { recursive: true });
    await page.screenshot({
      path: path.join(outputDir, "nclt-case-number-form.png"),
      fullPage: true,
    });

    console.log("Inspection screenshot saved in output/");
  } finally {
    await session.close();
  }
}

main().catch((error: unknown) => {
  console.error("NCLT page inspection failed:", error);
  process.exitCode = 1;
});
