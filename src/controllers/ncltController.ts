import { Request, Response } from "express";
import { runNcltCaseSearch } from "../routes/automation/sources/nclt/nclt.source";
import { NcltSearchInput } from "../routes/automation/sources/nclt/nclt.types";
import { saveNcltSearchResult } from "../routes/automation/sources/nclt/nclt.repository";
import { getMongoDb } from "../db/mongo";
import { makeNcltCaseKeyFromInput } from "../routes/automation/sources/nclt/nclt.repository";

type ParseResult =
  | { ok: true; value: NcltSearchInput }
  | { ok: false; errors: string[] };

function readText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseNcltSearchInput(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: ["Request body must be a JSON object."] };
  }

  const fields = body as Record<string, unknown>;
  const bench = readText(fields.bench);
  const caseType = readText(fields.caseType);
  const caseNumber = readText(fields.caseNumber);
  const caseYear = readText(fields.caseYear);
  const errors: string[] = [];

  if (!bench) errors.push("bench is required.");
  if (!caseType) errors.push("caseType is required.");
  if (!caseNumber) errors.push("caseNumber is required.");

  if (!caseYear) {
    errors.push("caseYear is required.");
  } else if (!/^\d{4}$/.test(caseYear)) {
    errors.push("caseYear must be a four-digit year.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      bench: bench!,
      caseType: caseType!,
      caseNumber: caseNumber!,
      caseYear: caseYear!,
    },
  };
}

export async function searchNcltCase(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = parseNcltSearchInput(req.body);

  if (!parsed.ok) {
    res.status(400).json({
      source: "nclt",
      status: "error",
      errors: parsed.errors,
    });
    return;
  }

  const result = await runNcltCaseSearch(parsed.value);
  if (result.status === "success" || result.status === "no_records") {
    try {
      await saveNcltSearchResult(result);
    } catch (error) {
      res.status(503).json({ ...result, persistenceError: error instanceof Error ? error.message : "Could not save search result." });
      return;
    }
  }
  const httpStatus = result.status === "error" ? 502 : 200;

  res.status(httpStatus).json(result);
}

export async function getSavedNcltCases(_req: Request, res: Response): Promise<void> {
  try {
    const db = await getMongoDb();
    const cases = await db.collection("ncltCases").find({}, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).limit(50).toArray();
    res.json({ source: "nclt", status: "success", cases });
  } catch (error) {
    res.status(503).json({ source: "nclt", status: "error", message: error instanceof Error ? error.message : "Could not load saved cases." });
  }
}

export async function getNcltOrders(req: Request, res: Response): Promise<void> {
  const { bench, caseType, caseNumber, caseYear } = req.query;
  if (![bench, caseType, caseNumber, caseYear].every((value) => typeof value === "string" && value.trim())) {
    res.status(400).json({ source: "nclt", status: "error", message: "bench, caseType, caseNumber, and caseYear are required." });
    return;
  }
  const caseKey = makeNcltCaseKeyFromInput({
    bench: String(bench).trim(),
    caseType: String(caseType).trim(),
    caseNumber: String(caseNumber).trim(),
    caseYear: String(caseYear).trim(),
  });
  try {
    const db = await getMongoDb();
    const orders = await db.collection("ncltOrders").find({ caseKey }, { projection: { _id: 0 } }).sort({ hearingDate: -1 }).toArray();
    res.json({ source: "nclt", status: "success", orders });
  } catch (error) {
    res.status(503).json({ source: "nclt", status: "error", message: error instanceof Error ? error.message : "Could not load order metadata." });
  }
}
