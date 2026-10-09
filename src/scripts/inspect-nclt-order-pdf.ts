import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { PDFParse } from "pdf-parse";

function isOfficialNcltUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();

  return (
    url.protocol === "https:" &&
    (hostname === "nclt.gov.in" || hostname.endsWith(".nclt.gov.in"))
  );
}

async function main(): Promise<void> {
  const orderUrl = process.argv[2];

  if (!orderUrl) {
    throw new Error(
      "Usage: npm run inspect:nclt-order-pdf -- <official-pdf-url>",
    );
  }

  const parsedUrl = new URL(orderUrl);

  if (!isOfficialNcltUrl(parsedUrl)) {
    throw new Error("Please provide an HTTPS URL on the official NCLT domain.");
  }

  const response = await fetch(parsedUrl, { redirect: "follow" });

  if (!isOfficialNcltUrl(new URL(response.url))) {
    throw new Error("The PDF URL redirected outside the official NCLT domain.");
  }

  if (!response.ok) {
    throw new Error(`PDF download failed with status ${response.status}.`);
  }

  const pdfData = Buffer.from(await response.arrayBuffer());

  if (pdfData.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("The URL did not return a valid PDF.");
  }

  const outputDir = path.resolve("output", "orders");
  await mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "first-order-check.pdf");
  await writeFile(outputPath, pdfData);

  const parser = new PDFParse({ data: pdfData });

  try {
    const result = await parser.getText({ first: 1 });

    console.log(
      JSON.stringify(
        {
          sourceUrl: response.url,
          savedTo: outputPath,
          bytes: pdfData.length,
          firstPageText: result.pages[0]?.text ?? "",
        },
        null,
        2,
      ),
    );
  } finally {
    await parser.destroy();
  }
}

main().catch((error: unknown) => {
  console.error("NCLT order PDF inspection failed:", error);
  process.exitCode = 1;
});
