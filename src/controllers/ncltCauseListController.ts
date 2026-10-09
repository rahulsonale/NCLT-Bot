import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Request, Response } from "express";
import { fetchNcltCauseList } from "../routes/automation/sources/nclt/causeList.source";
import { searchCauseListPdf } from "../routes/automation/sources/nclt/causeListPdf";

function isOfficialNcltUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isNcltHost =
      hostname === "nclt.gov.in" || hostname.endsWith(".nclt.gov.in");

    return url.protocol === "https:" && isNcltHost ? url : null;
  } catch {
    return null;
  }
}

export async function getNcltCauseList(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await fetchNcltCauseList();
  res.status(result.status === "error" ? 502 : 200).json(result);
}

export async function searchNcltCauseListCase(
  req: Request,
  res: Response,
): Promise<void> {
  const caseNumber =
    typeof req.query.caseNumber === "string" ? req.query.caseNumber.trim() : "";

  const documentUrl =
    typeof req.query.documentUrl === "string"
      ? req.query.documentUrl.trim()
      : "";

  if (!caseNumber) {
    res.status(400).json({
      source: "nclt",
      status: "error",
      message: "The caseNumber query parameter is required.",
    });
    return;
  }

  let temporaryPdfPath: string | null = null;

  try {
    let pdfPath = path.resolve(process.cwd(), "output/cause-list.pdf");

    if (documentUrl) {
      const officialUrl = isOfficialNcltUrl(documentUrl);

      if (!officialUrl) {
        res.status(400).json({
          source: "nclt",
          status: "error",
          message: "documentUrl must be an HTTPS URL on nclt.gov.in.",
        });
        return;
      }

      const response = await fetch(officialUrl, { redirect: "follow" });
      const finalUrl = isOfficialNcltUrl(response.url);

      if (!finalUrl) {
        res.status(502).json({
          source: "nclt",
          status: "error",
          message: "The document redirected outside the official NCLT website.",
        });
        return;
      }

      if (!response.ok) {
        res.status(502).json({
          source: "nclt",
          status: "error",
          message: `The NCLT document download failed with status ${response.status}.`,
        });
        return;
      }

      const pdfData = Buffer.from(await response.arrayBuffer());

      if (pdfData.subarray(0, 5).toString("ascii") !== "%PDF-") {
        res.status(502).json({
          source: "nclt",
          status: "error",
          message: "The document URL did not return a valid PDF.",
        });
        return;
      }

      temporaryPdfPath = path.join(
        os.tmpdir(),
        `nclt-cause-list-${randomUUID()}.pdf`,
      );

      await writeFile(temporaryPdfPath, pdfData);
      pdfPath = temporaryPdfPath;
    }

    const matches = await searchCauseListPdf(pdfPath, caseNumber);

    res.status(200).json({
      source: "nclt",
      status: matches.length > 0 ? "found" : "not_found",
      caseNumber,
      documentUrl: documentUrl || null,
      matches,
    });
  } catch (error) {
    res.status(500).json({
      source: "nclt",
      status: "error",
      caseNumber,
      message:
        error instanceof Error
          ? error.message
          : "Could not search the cause-list PDF.",
    });
  } finally {
    if (temporaryPdfPath) {
      await unlink(temporaryPdfPath).catch(() => {});
    }
  }
}
