import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { closeMongoDb } from "../db/mongo";
import { makeNcltCaseKeyFromInput, saveNcltOrderMetadata } from "../routes/automation/sources/nclt/nclt.repository";

interface ManifestOrder {
  listingDate?: string | null;
  sourceUrl: string;
  fileName?: string | null;
  sha256?: string | null;
  status: "downloaded" | "duplicate" | "error";
}

async function main(): Promise<void> {
  const ordersRoot = path.resolve("output/orders");
  const directories = await readdir(ordersRoot, { withFileTypes: true });
  let saved = 0;

  try {
    for (const directory of directories.filter((entry) => entry.isDirectory())) {
      const parts = directory.name.split("-");
      if (parts.length < 4) continue;
      const [bench, caseType, caseNumber, caseYear] = parts;
      const directoryPath = path.join(ordersRoot, directory.name);
      let manifest: ManifestOrder[];

      try {
        manifest = JSON.parse(await readFile(path.join(directoryPath, "manifest.json"), "utf8")) as ManifestOrder[];
      } catch {
        continue;
      }

      for (const order of manifest) {
        if (order.status === "error" || !order.fileName) continue;
        const pdfPath = path.join(directoryPath, order.fileName);
        try {
          await access(pdfPath);
        } catch {
          continue;
        }

        const extractedPath = path.join(directoryPath, `${path.parse(order.fileName).name}.extracted.json`);
        let extractedTextPath: string | undefined;
        try {
          await access(extractedPath);
          extractedTextPath = extractedPath;
        } catch {
          // OCR has not been run for this PDF yet.
        }

        await saveNcltOrderMetadata({
          caseKey: makeNcltCaseKeyFromInput({ bench, caseType, caseNumber, caseYear }),
          sourceUrl: order.sourceUrl,
          pdfPath,
          ...(order.sha256 ? { sha256: order.sha256 } : {}),
          ...(extractedTextPath ? { extractedTextPath } : {}),
          ...(order.listingDate ? { hearingDate: order.listingDate } : {}),
        });
        saved += 1;
      }
    }
    console.log(`Synced ${saved} existing order records to MongoDB.`);
  } finally {
    await closeMongoDb();
  }
}

main().catch((error: unknown) => {
  console.error("Order metadata sync failed:", error);
  process.exitCode = 1;
});
