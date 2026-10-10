import { getMongoDb } from "../../../../db/mongo";
import { NcltSearchInput, NcltSearchResult } from "./nclt.types";

const caseTypeIds: Record<string, string> = {
  "transfer petition(company act)": "1",
  "company petition(company act)": "2",
  "rehabilitation petition(company act)": "3",
  "interlocutory application(company act)": "4",
  "review application(company act)": "5",
  "restoration application(company act)": "6",
  "intervention petition(company act)": "7",
  "cross application(company act)": "8",
  "contempt petition(company act)": "9",
  "miscellaneous application(company act)": "10",
  "company appeal(company act)": "11",
  "cross appeal(company act)": "12",
  "company application(company act)": "13",
  "ca(a) merger & amalgamation(company act)": "14",
  "cp(aa) merger & amalgamation(company act)": "15",
  "company petition ib(ibc)": "16",
  "company application(ibc)": "18",
  "rehabilitation petition(ibc)": "19",
  "interlocatory application(ibc)": "20",
  "review application(ibc)": "21",
  "restoration application(ibc)": "22",
  "intervention petition(ibc)": "23",
  "cross application(ibc)": "24",
  "contempt petition(ibc)": "25",
  "miscellaneous application(ibc)": "26",
  "company appeal(ibc)": "27",
  "cross appeal(ibc)": "28",
  "transfer petition(ibc)": "29",
  "execution petition(company act)": "30",
  "interlocutory application(ibc)(ibc)": "31",
  "transfer application(company act)": "32",
  "insolvency & bankruptcy (pre-packaged)": "33",
  "transfer application (ibc)(ibc)": "34",
  "voluntary liquidation (ibc) (ibc)": "35",
  "restored company petition (ibc) (ibc)": "36",
  "restored company petition (companies act)(company act)": "37",
  "interlocutory application(ibc)(plan)(ibc)": "38",
  "interlocutory application(ibc)(liq.)(ibc)": "39",
  "interlocutory application(ibc)(dis.)(ibc)": "40",
  "ia (liq.) progress report(ibc)": "41",
  "rule 63 appeal": "42",
  "execution petition (ibc)(ibc)": "43",
};

function canonicalBench(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^national company law tribunal,\s*/, "").replace(/\s*bench\s*$/, "").trim();
  return normalized.replace(/\s+/g, " ");
}

export function makeNcltCaseKeyFromInput(input: NcltSearchInput): string {
  const caseType = input.caseType.trim().toLowerCase();
  return [canonicalBench(input.bench), caseTypeIds[caseType] ?? caseType, input.caseNumber.trim().toLowerCase(), input.caseYear.trim().toLowerCase()].join("|");
}

export function makeNcltCaseKey(result: NcltSearchResult): string {
  return makeNcltCaseKeyFromInput(result.input);
}

export async function saveNcltSearchResult(
  result: NcltSearchResult,
): Promise<void> {
  const db = await getMongoDb();
  const caseKey = makeNcltCaseKey(result);
  const legacyCaseKey = [result.input.bench, result.input.caseType, result.input.caseNumber, result.input.caseYear]
    .map((value) => value.trim().toLowerCase()).join("|");
  const set = {
    caseKey,
    input: result.input,
    status: result.status,
    cases: result.cases,
    sourceUrl: result.sourceUrl,
    checkedAt: new Date(result.checkedAt),
    ...(result.message ? { message: result.message } : {}),
    ...(result.error ? { error: result.error } : {}),
    updatedAt: new Date(),
  };

  if (legacyCaseKey !== caseKey) {
    const migrated = await db.collection("ncltCases").updateOne(
      { caseKey: legacyCaseKey },
      { $set: set },
    );
    if (migrated.matchedCount > 0) return;
  }

  await db.collection("ncltCases").updateOne(
    { caseKey },
    {
      $set: set,
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
