import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

interface ExtractedPage {
  page: number;
  method: "pdf-text" | "ocr";
  text: string;
}

async function main(): Promise<void> {
  const suppliedPdfPath =
    process.argv[2] ?? "output/orders/first-order-check.pdf";
  const pdfPath = path.resolve(suppliedPdfPath);
  const pdfData = await readFile(pdfPath);
  const parser = new PDFParse({ data: pdfData });

  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;

  try {
    const nativeResult = await parser.getText();
    const extractedPages: ExtractedPage[] = [];

    worker = await createWorker("eng");

    for (const page of nativeResult.pages) {
      const nativeText = page.text.trim();

      if (nativeText.length >= 40) {
        extractedPages.push({
          page: page.num,
          method: "pdf-text",
          text: nativeText,
        });
        continue;
      }

      console.log(`Running OCR on page ${page.num}...`);

      const screenshot = await parser.getScreenshot({
        partial: [page.num],
        scale: 2,
        imageBuffer: true,
        imageDataUrl: false,
      });

      const pageImage = screenshot.pages[0]?.data;

      if (!pageImage) {
        throw new Error(`Could not render PDF page ${page.num} as an image.`);
      }

      const ocrResult = await worker.recognize(Buffer.from(pageImage));

      extractedPages.push({
        page: page.num,
        method: "ocr",
        text: ocrResult.data.text.trim(),
      });
    }

    const output = {
      sourcePdf: pdfPath,
      pageCount: nativeResult.total,
      pages: extractedPages,
    };

    const outputDir = path.resolve("output", "orders");
    await mkdir(outputDir, { recursive: true });

    const outputPath = path.join(
      outputDir,
      `${path.basename(pdfPath, path.extname(pdfPath))}.extracted.json`,
    );

    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

    console.log(JSON.stringify(output, null, 2));
    console.log(`Extracted text saved to ${outputPath}`);
  } finally {
    if (worker) {
      await worker.terminate();
    }

    await parser.destroy();
  }
}

main().catch((error: unknown) => {
  console.error("NCLT order OCR failed:", error);
  process.exitCode = 1;
});
