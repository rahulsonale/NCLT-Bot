import path from "node:path";
import { searchCauseListPdf } from "../routes/automation/sources/nclt/causeListPdf";

async function main(): Promise<void> {
  const [, , caseNumber, suppliedPdfPath] = process.argv;
  if (!caseNumber) {
    throw new Error("Usage: npm run search:cause-list-pdf -- <case-number> [pdf-path]");
  }

  const pdfPath = path.resolve(suppliedPdfPath ?? "output/cause-list.pdf");
  const matches = await searchCauseListPdf(pdfPath, caseNumber);
  console.log(JSON.stringify({ caseNumber, pdfPath, matchCount: matches.length, matches }, null, 2));
}

main().catch((error: unknown) => {
  console.error("Cause-list PDF search failed:", error);
  process.exitCode = 1;
});
