export interface NcltSearchInput {
  /** Exact bench option selected on the NCLT site. */
  bench: string;
  /** Exact case type option selected on the NCLT site. */
  caseType: string;
  caseNumber: string;
  caseYear: string;
}

export interface NcltCaseRecord {
  filingNumber: string | null;
  caseType: string | null;
  caseNumber: string | null;
  caseTitle: string | null;
  benchLocationAndCourt: string | null;
  mainCaseFilingNumber: string | null;
  filingDate: string | null;
  registrationDate: string | null;
  nextListingOrDisposeDate: string | null;
  caseStatus: string | null;
  caseStage: string | null;
  allHearingsCount: number | null;
  effectiveHearingsCount: number | null;
}

export type NcltSearchStatus =
  | "success"
  | "no_records"
  | "manual_action_required"
  | "error";

export interface NcltSearchResult {
  source: "nclt";
  status: NcltSearchStatus;
  input: NcltSearchInput;
  cases: NcltCaseRecord[];
  sourceUrl: string;
  checkedAt: string;
  message?: string;
  error?: string;
}
