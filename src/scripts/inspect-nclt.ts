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
      const selectDetails = Array.from(
        document.querySelectorAll(
          "select#id_i_bench_id_case_no, " +
            "select#id_i_case_type_caseno, " +
            "select#id_i_case_year_caseno",
        ),
      ).map((select) => ({
        id: select.id,
        options: Array.from((select as HTMLSelectElement).options).map(
          (option) => ({
            text: option.textContent?.trim(),
            label: option.label,
            value: option.value,
            dataContent: option.getAttribute("data-content"),
            html: option.outerHTML,
          }),
        ),
      }));

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
      const clickTargets = Array.from(
        document.querySelectorAll(
          'button, input[type="button"], input[type="submit"], a',
        ),
      )
        .filter((element) => (element as HTMLElement).offsetParent !== null)
        .map((element) => ({
          tag: element.tagName,
          id: (element as HTMLElement).id,
          text: (element as HTMLElement).innerText?.trim(),
          value: (element as HTMLInputElement).value,
          html: element.outerHTML,
        }));

      return { selectDetails, inputDetails, clickTargets };
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
