import { getMongoDb } from "../../../../db/mongo";
import { NcltSearchResult } from "./nclt.types";

export function makeNcltCaseKey(result: NcltSearchResult): string {
  const { bench, caseType, caseNumber, caseYear } = result.input;

  return [bench, caseType, caseNumber, caseYear]
    .map((value) => value.trim().toLowerCase())
    .join("|");
}

export async function saveNcltSearchResult(
  result: NcltSearchResult,
): Promise<void> {
  const db = await getMongoDb();
  const caseKey = makeNcltCaseKey(result);

  await db.collection("ncltCases").updateOne(
    { caseKey },
    {
      $set: {
        caseKey,
        input: result.input,
        status: result.status,
        cases: result.cases,
        sourceUrl: result.sourceUrl,
        checkedAt: new Date(result.checkedAt),
        ...(result.message ? { message: result.message } : {}),
        ...(result.error ? { error: result.error } : {}),
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export interface NcltOrderMetadata {
  caseKey: string;
  sourceUrl: string;
  pdfPath: string;
  sha256?: string;
  extractedTextPath?: string;
  hearingDate?: string;
  court?: string;
  itemNumber?: string;
}

export async function saveNcltOrderMetadata(
  order: NcltOrderMetadata,
): Promise<void> {
  const db = await getMongoDb();

  await db.collection("ncltOrders").updateOne(
    {
      caseKey: order.caseKey,
      sourceUrl: order.sourceUrl,
    },
    {
      $set: {
        ...order,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
}
