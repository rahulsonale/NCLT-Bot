import { openNcltBrowser } from "../../core/browser";

const CAUSE_LIST_URL = "https://nclt.gov.in/all-cause-list";

export interface NcltCauseListEntry {
  serialNumber: string | null;
  title: string | null;
  court: string | null;
  entryCount: number | null;
  date: string | null;
  documentUrl: string | null;
}

export interface NcltCauseListResult {
  source: "nclt";
  status: "success" | "error";
  sourceUrl: string;
  checkedAt: string;
  entries: NcltCauseListEntry[];
  message?: string;
  error?: string;
}

export async function fetchNcltCauseList(): Promise<NcltCauseListResult> {
  const session = await openNcltBrowser();

  try {
    const { page } = session;
    await page.goto(CAUSE_LIST_URL, { waitUntil: "domcontentloaded" });
    await page.locator("table").first().waitFor({ state: "visible" });

    const entries = await page.evaluate(() => {
      const table = document.querySelector("table");
      if (!table) return [];

      const headers = Array.from(table.querySelectorAll("th")).map((cell) =>
        cell.innerText.replace(/\s+/g, " ").trim().toLowerCase(),
      );
      const indexFor = (pattern: RegExp): number =>
        headers.findIndex((header) => pattern.test(header));

      const serialIndex = indexFor(/^s\.?\s*no\.?$/);
      const titleIndex = indexFor(/title/);
      const courtIndex = indexFor(/court/);
      const countIndex = indexFor(/entries/);
      const dateIndex = indexFor(/^date$/);
      const documentIndex = indexFor(/documents?/);

      return Array.from(table.querySelectorAll("tbody tr"))
        .map((row) => {
          const cells = Array.from(row.querySelectorAll("td"));
          const textAt = (index: number): string | null =>
            index >= 0 ? cells[index]?.innerText.replace(/\s+/g, " ").trim() || null : null;
          const documentCell = documentIndex >= 0 ? cells[documentIndex] : null;
          const link = documentCell?.querySelector("a[href]") as HTMLAnchorElement | null;

          return {
            serialNumber: textAt(serialIndex),
            title: textAt(titleIndex),
            court: textAt(courtIndex),
            entryCount: Number(textAt(countIndex)) || null,
            date: textAt(dateIndex),
            documentUrl: link?.href ?? null,
          };
        })
        .filter((entry) => entry.title || entry.documentUrl);
    });

    return {
      source: "nclt",
      status: "success",
      sourceUrl: page.url(),
      checkedAt: new Date().toISOString(),
      entries,
      ...(entries.length === 0 ? { message: "No cause-list rows were found on the current page." } : {}),
    };
  } catch (error) {
    return {
      source: "nclt",
      status: "error",
      sourceUrl: CAUSE_LIST_URL,
      checkedAt: new Date().toISOString(),
      entries: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await session.close();
  }
}
