import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

export interface NcltCauseListPdfMatch {
  caseNumber: string;
  page: number;
  hearingDate: string | null;
  court: string | null;
  itemNumber: string | null;
  context: string;
}

function normalizeCaseNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function findHeaderValue(text: string, expression: RegExp): string | null {
  return text.match(expression)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

/** Search a cause-list PDF for an exact case-number match. */
export async function searchCauseListPdf(
  pdfPath: string,
  caseNumber: string,
): Promise<NcltCauseListPdfMatch[]> {
  const expected = normalizeCaseNumber(caseNumber);
  if (!expected) throw new Error("A case number is required.");

  const parser = new PDFParse({ data: await readFile(pdfPath) });
  try {
    const result = await parser.getText();
    const matches: NcltCauseListPdfMatch[] = [];
    const documentText = result.pages.map((page) => page.text).join("\n");
    const documentHearingDate = findHeaderValue(
      documentText,
      /\bDATE\s*:\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/i,
    );
    const documentCourt = findHeaderValue(
      documentText,
      /\b(?:DIVISION\s+)?BENCH\s*\(\s*(Court\s+[^)]+)\)/i,
    );

    for (const page of result.pages) {
      const lines = page.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const normalizedPage = normalizeCaseNumber(page.text);
      if (!normalizedPage.includes(expected)) continue;

      // Preserve exact case-number occurrences; punctuation and spacing in NCLT PDFs vary.
      const lineIndex = lines.findIndex((line) => normalizeCaseNumber(line).includes(expected));
      if (lineIndex < 0) continue;

      const matchingLine = lines[lineIndex];
      const itemNumber = matchingLine.match(/^\s*(\d{1,3})\s+(?=[A-Z(])/i)?.[1] ?? null;
      const snippet = lines.slice(Math.max(0, lineIndex - 2), Math.min(lines.length, lineIndex + 5)).join(" ");
      const hearingDate = findHeaderValue(
        page.text,
        /\bDATE\s*:\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/i,
      ) ?? documentHearingDate;
      const court = findHeaderValue(
        page.text,
        /\b(?:DIVISION\s+)?BENCH\s*\(\s*(Court\s+[^)]+)\)/i,
      ) ?? documentCourt;

      matches.push({ caseNumber, page: page.num, hearingDate, court, itemNumber, context: snippet });
    }

    return matches;
  } finally {
    await parser.destroy();
  }
}
