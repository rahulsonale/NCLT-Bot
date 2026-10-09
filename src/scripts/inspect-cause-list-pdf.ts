import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

async function main(): Promise<void> {
  const buffer = await readFile("output/cause-list.pdf");
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    console.log(`Pages: ${result.total}`);
    console.log(result.text);
  } finally {
    await parser.destroy();
  }
}

main().catch((error: unknown) => {
  console.error("Cause-list PDF inspection failed:", error);
  process.exitCode = 1;
});
