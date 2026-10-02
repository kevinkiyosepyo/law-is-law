# Dashboard Ultra Pro Max

## [Try the live demo →](https://law-is-law-demo.vercel.app/)

**No login, password, or installation required.** Open the dashboard and try it yourself: explore a sample case, check its bottlenecks and Waiting Room, and follow the source links to the evidence.

The public demo uses fictional cases only. Live integrations and real case imports are disabled.

---

A local personal-injury case dashboard for the Law-Di-Gras hackathon. Select a matter, see its recorded open tasks and waiting parties, inspect the original evidence, and approve a limited view for each treating provider.

## Run locally

Requires Node.js 22.13+ (tested with Node 26), npm, and a browser.

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:4310` and sign in with `123`. This shared demo password works on fresh clones without an `.env` file. Before importing real case data, copy `.env.example` to `.env`, set a strong private `APP_PASSWORD`, and restart. An unset or empty `APP_PASSWORD` uses `123`.

The private local access link printed in the terminal also signs you in once. Browser sessions last 12 hours; restarting creates a new link and ends existing sessions. The shared demo password is not suitable for public deployment.

```sh
npm test
npm run build
npm start
```

The development and production commands both bind only to the local machine. Provider links are local preview links, not internet-hosted portals.

## What the first draft does

- Attorney overview with prioritized recorded tasks, coverage, treatment, liens, financial fields, and recent activity.
- Waiting Room with the party, request/response history where identified, recorded due date, and suggested next action.
- Searchable evidence with original text and source locators. Imported text retains original line numbers; Clio imports retain record IDs.
- Provider approvals with individually selected facts and that provider's requests. Source excerpts are excluded unless explicitly approved. Each approval creates a frozen snapshot, an expiring bearer link, and an access counter. Revocation takes effect immediately.
- Cached imports in local SQLite. Opening a page does not re-fetch Clio or re-run external AI.
- Text/JSON matter import and a downloadable JSON template. Additional matters use the same digestion pipeline.

## Sample data

On this workspace, the first launch reads the supplied raw export at `/Users/kevinpoopz/Desktop/Law is law/sapini-case-file.txt`. Set `SAMPLE_CASE_PATH` for another compatible text export. A different machine without that file starts with the clearly fictional `fixtures/example-case.txt` instead. Original case data is not committed to the repository.

The Sapini export is **sample data, not a verified live connection**. It contains truncated fields, incomplete communications, and a document inventory rather than PDF contents. These limits appear in the UI. Digestion excludes the export's analytical/derived sections. The analyzed `sapini-case-file.json` is not used as factual input.

Records use an explicit snapshot date: waiting age and urgency are relative to that date, not an invented current case state. Missing information stays unknown. Amounts are recorded source assertions and are not settlement predictions or verified balances.

## Connect Clio

1. Register a Clio Manage developer application in the region of your seeded account, with permission to **read** the relevant case resources.
2. Copy `.env.example` to `.env`. Fill `CLIO_CLIENT_ID`, `CLIO_CLIENT_SECRET`, and `CLIO_REGION` (`US`, `CA`, `EU`, or `AU`). Register the exact redirect URI `http://127.0.0.1:4310/api/clio/callback` in Clio. If you change the port, also update the callback.
3. Restart the app, use **Connect Clio** in the connection screen, and complete Clio authorization in your own browser.
4. Use **Refresh from Clio** to import. Inspect any warnings for permissions or incomplete collections. The sample matter remains separately labeled.

An existing `CLIO_ACCESS_TOKEN` can also be supplied server-side; OAuth is preferable for renewable access. OAuth tokens are stored only in the server's ignored `.data/` directory, never in browser storage or source control. Token exchange/refresh uses OAuth POST requests; case resource operations use GET only. The app never creates, updates, or deletes Clio case data. Live availability must be verified against your own account; mocked integration tests do not establish a live connection.

## Import another matter

Use the Import action with a `.txt` export or a `.json` file based on **Download import template**. JSON accepts:

```json
{
  "matter": {
    "id": "unique-matter-id",
    "number": "CASE-002",
    "clientName": "Example Client",
    "status": "Open",
    "stage": "Treatment",
    "asOf": "2026-10-02"
  },
  "providers": [{ "id": "provider-1", "name": "Example Provider" }],
  "sources": [{
    "id": "task-1",
    "type": "task",
    "title": "Obtain updated records from Example Provider",
    "text": "Status: Pending\nAssigned: Attorney\nDue: 2026-10-05",
    "locator": "Original task 1"
  }]
}
```

Supported source types: `note`, `communication`, `task`, `calendar`, `document`, `field`, `expense`, and `contact`. Original text is required. Plain unstructured text can be inspected as evidence, but structured sources produce more useful findings. The source format is documented by the downloadable template. Imports are limited to 6 MB and 10,000 records. Reimporting the same matter identifier replaces its cached snapshot, while existing provider approvals remain frozen.

## Architecture and boundaries

React + TypeScript + Vite; Express on Node.js; built-in SQLite. The shared snapshot schema is in `shared/types.ts`. `server/digest.ts` is the common derivation layer; `server/clio.ts` handles Clio; `server/store.ts` owns local snapshots and approvals. The UI consumes authenticated JSON endpoints.

This draft uses **deterministic extraction and keyword rules**, not a hosted language model. AI provider cost is therefore $0. Blockers come from recorded open tasks; request matching, ownership suggestions, and next actions need attorney review. It does not infer every possible blocker from arbitrary documents. Document binaries/OCR, automatic legal deadline conclusions, settlement prediction, chat, and outbound messaging are outside this draft.

Local access is intended for one attorney workspace. Provider requests are filtered server-side. Share tokens are random, stored as hashes, expire after seven days, and can be revoked. They grant access to anyone holding the link; provider identity is not independently verified. A public deployment would require proper staff/provider authentication, HTTPS, encrypted storage and operational controls. The current server intentionally listens on loopback only.

Runtime data and tokens live in ignored `.data/dashboard.sqlite` with restrictive file permissions. This is local persistence, not an encrypted vault. Do not commit `.data`, `.env`, original case files, or screenshots containing private case information.
