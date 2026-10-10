# NCLT Case Desk

A small Express and TypeScript application for searching NCLT case records, finding case numbers in cause-list PDFs, downloading order PDFs, and extracting scanned PDF text with OCR. Successful case searches and downloaded order metadata are saved to MongoDB.

## Requirements

- Node.js 20 or newer
- MongoDB running locally or a reachable MongoDB connection string
- A Chromium browser for Playwright (install it once with `npx playwright install chromium`)

## Setup and run

1. Install dependencies with `npm install`.
2. Set `MONGODB_URI` and, if needed, `MONGODB_DB` in your shell or launch environment. The default database name is `nclt_bot`. `.env.example` documents the expected values; this project does not load `.env` files automatically.
3. Run `npm run check:mongodb` to verify the connection and create indexes.
4. Run `npm run dev` and open [http://localhost:3000](http://localhost:3000).

The API is available under `/api`; `/health` reports whether the server is responding. MongoDB must be available for case search persistence and the recent searches panel.

## Using the screen

- **Case search:** select the bench and case type, enter the case number and year, then search. Successful results and confirmed no-record results are upserted in `ncltCases`. The Recent case searches panel reads the latest saved records.
- **Cause list:** enter a case number. Leave the PDF URL blank to search `output/cause-list.pdf`, or paste an HTTPS NCLT document URL. Matches show the PDF page and any recognized hearing date, court, and item number.
- **CAPTCHA:** NCLT may require manual CAPTCHA completion. Set `HEADED=1` before starting the server to open a browser window; complete and submit the CAPTCHA yourself there. Automated CAPTCHA solving is not supported.

## Order PDF and OCR commands

The order search currently runs as an interactive terminal command so the user can complete the site CAPTCHA:

```text
npm run search:nclt-order -- chennai 26 356 2019
```

Order PDFs and manifests are written under `output/orders/`. Successfully downloaded order metadata is upserted in MongoDB collection `ncltOrders` with the case key, official source URL, local PDF path, checksum, and listing date when available.

To import metadata from order PDFs and manifests downloaded before MongoDB integration, run `npm run sync:order-metadata` once after setting `MONGODB_URI`.

Extract text from one PDF or a directory of order PDFs:

```text
npm run ocr:nclt-order -- output/orders/chennai-26-356-2019
```

OCR output is written beside each PDF as `.extracted.json`, with an `ocr-manifest.json` for the batch. OCR can misread scanned text; verify case details and dates against the source PDF.

## API routes

- `POST /api/nclt/search` — search and persist a case lookup
- `GET /api/nclt/cases` — latest saved case searches
- `GET /api/nclt/orders?bench=...&caseType=...&caseNumber=...&caseYear=...` — saved order metadata for a case
- `GET /api/nclt/cause-list` — discover current cause-list entries
- `GET /api/nclt/cause-list/search?caseNumber=...&documentUrl=...` — search a local or official NCLT PDF

Case and order documents stay on the local machine; only metadata and extracted case results are stored in MongoDB.
