import { Request, Response } from "express";
import { fetchNcltCauseList } from "../routes/automation/sources/nclt/causeList.source";

export async function getNcltCauseList(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await fetchNcltCauseList();
  res.status(result.status === "error" ? 502 : 200).json(result);
}
