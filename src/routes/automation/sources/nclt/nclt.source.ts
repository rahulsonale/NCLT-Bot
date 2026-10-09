import { openNcltBrowser } from "../../core/browser";
import {
  NcltCaseRecord,
  NcltSearchInput,
  NcltSearchResult,
} from "./nclt.types";

const CASE_HISTORY_URL =
  "https://efiling.nclt.gov.in/casehistorybeforeloginmenutrue.drt";

function textOrNull(value: string | undefined): string | null {
  const cleaned = value?.replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned === "-") {
    return null;
  }

  const parts = cleaned.split("/").map((part) => part.trim());

  if (parts.every((part) => /^n\/?a$/i.test(part) || part === "-")) {
    return null;
  }

  return cleaned;
}

function hearingCount(value: string, label: string): number | null {
  const match = value.match(new RegExp(`${label}\\s*:\\s*(\\d+)`, "i"));
  return match ? Number(match[1]) : null;
}

async function captchaIsVisible(
  page: import("playwright").Page,
): Promise<boolean> {
  return page.locator("input:visible").evaluateAll((inputs) =>
    inputs.some((element) => {
      const input = element as HTMLInputElement;
      const details = [
        input.id,
        input.name,
        input.placeholder,
        ...Array.from(input.labels ?? []).map((label) => label.innerText),
      ].join(" ");

      return /captcha/i.test(details);
    }),
  );
}

export async function runNcltCaseSearch(
  input: NcltSearchInput,
): Promise<NcltSearchResult> {
  const session = await openNcltBrowser();

  try {
    const { page } = session;

    await page.goto(CASE_HISTORY_URL, {
      waitUntil: "domcontentloaded",
    });

    // Set the search mode, then fill the case-number form.
    await page.locator("select").first().selectOption({
      label: "Case Number",
    });

    await page
      .locator("#id_i_bench_id_case_no")
      .selectOption({ label: input.bench });

    await page
      .locator("#id_i_case_type_caseno")
      .selectOption({ label: input.caseType });

    await page.locator("#id_case_no").fill(input.caseNumber);

    await page.locator("#id_i_case_year_caseno").selectOption(input.caseYear);

    if (await captchaIsVisible(page)) {
      return {
        source: "nclt",
        status: "manual_action_required",
        input,
        cases: [],
        sourceUrl: page.url(),
        checkedAt: new Date().toISOString(),
        message: "The page requires a CAPTCHA; complete it manually.",
      };
    }

    await page.locator("a.searchBtn:visible").click();
    await page
      .waitForFunction(
        () => {
          const tables = Array.from(document.querySelectorAll("table"));
          const resultTable = tables.find((table) =>
            Array.from(table.querySelectorAll("th")).some((header) =>
              /filing\s*no/i.test(header.innerText),
            ),
          );

          const hasRows =
            !!resultTable &&
            Array.from(resultTable.querySelectorAll("tr")).some(
              (row) => row.querySelectorAll("td").length > 0,
            );

          const noResults = /no records|no results|record not found/i.test(
            document.body.innerText,
          );

          return hasRows || noResults;
        },
        undefined,
        { timeout: 20_000 },
      )
      .catch(() => {});

    if (await captchaIsVisible(page)) {
      return {
        source: "nclt",
        status: "manual_action_required",
        input,
        cases: [],
        sourceUrl: page.url(),
        checkedAt: new Date().toISOString(),
        message: "The page requires a CAPTCHA; complete it manually.",
      };
    }

    const tableRows = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll("table"));
      const resultTable = tables.find((table) =>
        Array.from(table.querySelectorAll("th")).some((header) =>
          /filing\s*no/i.test(header.innerText),
        ),
      );

      if (!resultTable) return [];

      const rows = Array.from(resultTable.querySelectorAll("tr"));
      const headerRow = rows.find(
        (row) => row.querySelectorAll("th").length > 0,
      );

      if (!headerRow) return [];

      const headers = Array.from(headerRow.querySelectorAll("th")).map((cell) =>
        cell.innerText.replace(/\s+/g, " ").trim(),
      );

      return rows
        .filter(
          (row) => row !== headerRow && row.querySelectorAll("td").length > 0,
        )
        .map((row) => {
          const cells = Array.from(row.querySelectorAll("td")).map((cell) =>
            cell.innerText.trim(),
          );

          return Object.fromEntries(
            headers.map((header, index) => [header, cells[index] ?? ""]),
          ) as Record<string, string>;
        });
    });

    if (tableRows.length === 0) {
      const pageText = await page.locator("body").innerText();
      const noResults = /no records|no results|record not found/i.test(
        pageText,
      );

      return {
        source: "nclt",
        status: noResults ? "no_records" : "error",
        input,
        cases: [],
        sourceUrl: page.url(),
        checkedAt: new Date().toISOString(),
        message: noResults
          ? "The NCLT site returned no matching cases."
          : "Could not locate the case results table.",
      };
    }

    const findCell = (
      row: Record<string, string>,
      headerPart: string,
    ): string | undefined =>
      Object.entries(row).find(([header]) =>
        header.toLowerCase().includes(headerPart.toLowerCase()),
      )?.[1];

    const cases: NcltCaseRecord[] = tableRows.map((row) => {
      const filingCell = findCell(row, "Filing No.") ?? "";
      const dateCell = findCell(row, "Filing / Registration Date") ?? "";
      const dates = dateCell.match(/\b\d{2}-\d{2}-\d{4}\b/g) ?? [];

      return {
        filingNumber: textOrNull(filingCell.split(/\r?\n/)[0]),
        caseType: textOrNull(findCell(row, "Case Type")),
        caseNumber: textOrNull(findCell(row, "Case No")),
        caseTitle: textOrNull(findCell(row, "Case Title")),
        benchLocationAndCourt: textOrNull(
          findCell(row, "Bench Location / Court No."),
        ),
        mainCaseFilingNumber: textOrNull(findCell(row, "Main Case Filing No")),
        filingDate: dates[0] ?? null,
        registrationDate: dates[1] ?? null,
        nextListingOrDisposeDate: textOrNull(findCell(row, "Next Listing")),
        caseStatus: textOrNull(findCell(row, "Case Status")),
        caseStage: textOrNull(findCell(row, "Case Stage")),
        allHearingsCount: hearingCount(filingCell, "All Hearings"),
        effectiveHearingsCount: hearingCount(filingCell, "Effective Hearings"),
      };
    });

    return {
      source: "nclt",
      status: "success",
      input,
      cases,
      sourceUrl: page.url(),
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      source: "nclt",
      status: "error",
      input,
      cases: [],
      sourceUrl: CASE_HISTORY_URL,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await session.close();
  }
}
