import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

interface ExtractedPage {
  page: number;
  method: "pdf-text" | "ocr";
  text: string;
}

interface BatchResult {
  pdf: string;
  status: "success" | "error";
  extractedJson?: string;
  error?: string;
}

async function main(): Promise<void> {
  const suppliedPath = process.argv[2] ?? "output/orders/first-order-check.pdf";
  const inputPath = path.resolve(suppliedPath);
  const inputStats = await stat(inputPath);

  const pdfPaths = inputStats.isDirectory()
    ? (await readdir(inputPath))
        .filter((name) => name.toLowerCase().endsWith(".pdf"))
        .map((name) => path.join(inputPath, name))
        .sort()
    : [inputPath];

  if (pdfPaths.length === 0) {
    throw new Error(`No PDF files found at ${inputPath}`);
  }

  const worker = await createWorker("eng");
  const batchResults: BatchResult[] = [];

  try {
    for (const pdfPath of pdfPaths) {
      console.log(`Processing ${path.basename(pdfPath)}...`);

      let parser: PDFParse | undefined;

      try {
        const pdfData = await readFile(pdfPath);
        parser = new PDFParse({ data: pdfData });

        const nativeResult = await parser.getText();
        const extractedPages: ExtractedPage[] = [];

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

          console.log(`  Running OCR on page ${page.num}...`);

          const screenshot = await parser.getScreenshot({
            partial: [page.num],
            scale: 2,
            imageBuffer: true,
            imageDataUrl: false,
          });

          const pageImage = screenshot.pages[0]?.data;

          if (!pageImage) {
            throw new Error(`Could not render page ${page.num} as an image.`);
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

        const outputPath = path.join(
          path.dirname(pdfPath),
          `${path.basename(pdfPath, path.extname(pdfPath))}.extracted.json`,
        );

        await writeFile(
          outputPath,
          `${JSON.stringify(output, null, 2)}\n`,
          "utf8",
        );

        batchResults.push({
          pdf: path.basename(pdfPath),
          status: "success",
          extractedJson: path.basename(outputPath),
        });
      } catch (error) {
        batchResults.push({
          pdf: path.basename(pdfPath),
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });

        console.error(`  Failed: ${batchResults.at(-1)?.error}`);
      } finally {
        await parser?.destroy();
      }
    }

    const manifestDir = inputStats.isDirectory()
      ? inputPath
      : path.dirname(inputPath);

    await mkdir(manifestDir, { recursive: true });

    const manifestPath = path.join(manifestDir, "ocr-manifest.json");
    await writeFile(
      manifestPath,
      `${JSON.stringify(batchResults, null, 2)}\n`,
      "utf8",
    );

    console.log(JSON.stringify(batchResults, null, 2));
    console.log(`OCR manifest saved to ${manifestPath}`);
  } finally {
    await worker.terminate();
  }
}

main().catch((error: unknown) => {
  console.error("NCLT order OCR failed:", error);
  process.exitCode = 1;
});
