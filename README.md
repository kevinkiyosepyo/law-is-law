# Dashboard Ultra Pro Max

A personal-injury case dashboard built for the Law-Di-Gras hackathon.

The app answers: "What is stopping this case from moving forward, who are we waiting on, and what should happen next?"

Choose a matter to see its bottlenecks, reported injuries, recent activity, and supporting records. Attorneys can also review medical finances and create a provider view containing only the information they approve.

This is a local demo. It works with fictional sample matters without Clio credentials. The Clio connector is implemented but needs account-specific verification; the ChatGPT, Gmail, Slack, and MyChart integration screens are simulations.

## Run locally

Requires Node.js 22.13+ (tested with Node 26), npm, and a browser.

```sh
git clone --branch codex/add-hackathon-brief https://github.com/kevinkiyosepyo/law-is-law.git
cd law-is-law
npm ci
npm run dev
```

If you already cloned the repo, run `npm ci` and `npm run dev` from its root.

Open `http://127.0.0.1:4310` and sign in with `123`. This shared demo password works on fresh clones without an `.env` file. Before importing real case data, copy `.env.example` to `.env`, set a strong private `APP_PASSWORD`, and restart. An unset or empty `APP_PASSWORD` uses `123`.

The private local access link printed in the terminal also signs you in once. Browser sessions last 12 hours; restarting creates a new link and ends existing sessions. The shared demo password is not suitable for public deployment.

The development and production commands both bind only to the local machine. Provider links are local preview links, not internet-hosted portals.

## Try the demo

1. Sign in with `123` and select a matter. The fictional Kevin Pyo car-crash case has a longer walkthrough; Morgan Example is a smaller fallback case.
2. Read the short case summary, then open a bottleneck's source to see the record behind it. The longer summary stays below the short version; recent activity sits directly below bottlenecks.
3. Open Waiting Room to see outstanding requests, responsible parties, and suggested next actions.
4. Open Finances to inspect provider charges and recorded payments. Missing payment information stays unknown.
5. In Provider sharing, choose a provider and explicitly approve individual items. Preview the disclosure before creating a link, then revoke it when finished.

The [Kevin demo walkthrough](fixtures/kevin-pyo-car-crash-demo.md) has a longer presentation sequence. The [hackathon brief](ldg-applied-ai-hackathon.md) describes the original challenge.

## Features

- Attorney overview with prioritized recorded tasks, a short accident-and-injury summary, a detailed case summary, and recent activity.
- Interactive injury map with source-linked reported body areas. It is a way to navigate the records, not a diagnosis.
- Recorded coverage, treatment status, liens, and financial fields, with links back to their evidence.
- Waiting Room with the party, request/response history where identified, recorded due date, and suggested next action.
- Searchable evidence with original text and source locators. Imported text retains original line numbers; Clio imports retain record IDs.
- Finances with medical charges, insurer and patient payments, recorded patient responsibility, provider balances, insurance follow-up, source evidence, and CSV export. Unknown amounts stay unknown; partial totals are labeled.
- Provider approvals with individually selected facts and that provider's requests. Source excerpts are excluded unless explicitly approved. Each approval creates a frozen snapshot, an expiring bearer link, and an access counter. Revocation takes effect immediately.
- Cached imports in local SQLite. Opening a page does not re-fetch Clio or re-run external AI.
- Text/JSON matter import and a downloadable JSON template. Additional matters use the same digestion pipeline.

## Integration previews

Open **Integrations** in the sidebar. Simulate the ChatGPT and Gmail connections, then select **Preview new update** to show the centered claim notice and the **Status Updates** card on Overview. **Preview no updates** shows the empty inbox state. Slack has a connection card for the visual flow; it does not send notifications.

The built-in hospital email is fictional and is labeled as such. To present an actual hospital Gmail message, copy its sender, subject, and body into **Paste a Gmail email** after removing patient identifiers. Pasted text stays in browser memory for this session and is not sent to the app server. The claim status is selected manually for the demo and is not inferred from the message. The 8:00 a.m. schedule is a visual preview; account authorization, inbox retrieval, analysis, background scheduling, and Slack delivery are not active.

## MyChart preview

Open **MyChart** in the sidebar or its card under **Integrations**. Select **Kevin Pyo - Car Crash** for the fullest walkthrough, then **Preview connection**, acknowledge the fictional demo, and **Load demo records**. The six-item feed includes medical summaries, a provider message, a tentative appointment, a hospital statement, and a notification-only example. Clinical and billing examples link to related case sources; no records are actually fetched from MyChart and the fictional providers are not represented as MyChart participants.

Search or filter the feed, inspect a record, select individual items, and acknowledge review before **Add to attorney preview**. Switch to **Attorney preview** to see only those items. Notification-only emails cannot be included as medical records. In the patient view, use **Remove from attorney preview** to remove an item from the packet without deleting the record. These are UI perspectives, not authenticated patient/attorney roles, actual patient consent, or real delivery.

**Add record text** accepts fictional or de-identified pasted content, with provider, title, date, and record type. Records and selections are isolated by matter in browser memory, survive in-app navigation, and clear on page refresh or sign-out. Disconnecting the simulated portal retains existing preview records. Nothing is sent to an AI service or app server, saved into evidence/finances, or disclosed to another user. Imported/Clio matters do not get fictional portal records; they support the text preview only. Other sample matters use their own recorded treatment excerpt rather than Kevin's clinical story.

Live MyChart access is not configured. It would require a supported provider integration, patient authorization, proper role-based access, and production data-handling controls. The app never asks for MyChart credentials. MyChart's [official feature guide](https://www.mychart.org/l/en-us/explore/) distinguishes portal records and messages from email notifications.

## All Cases preview

Open **All Cases** below Overview to see each workspace matter as a card with its current stage and open-item count. **Import New Matters** accepts individual `.tex`, `.pdf`, `.md`, and `.txt` files, or one `.zip`. The new card is a browser-session preview made from the matter name and filenames. These formats are not parsed or stored by the demo import; use the existing text/JSON import in **Connections & import** for actual case ingestion.

## Sample data

Fresh clones use the fictional `fixtures/example-case.txt` fallback unless a compatible local sample is available. Set `SAMPLE_CASE_PATH` to load your own text export when initializing a workspace. The original development workspace also checks a local Sapini export; that file is not included in the repository. Changing this setting does not replace already cached sample matters. Use Import to add or update case data in an existing workspace.

Every workspace also includes **Kevin Pyo - Car Crash**, a detailed fictional collision matter in `fixtures/kevin-pyo-car-crash.txt`. It is added automatically on startup, including to existing workspaces, without replacing any saved matters. The export supplies the overview, open tasks, source evidence, timeline, and provider requests through the same parser as the other cases. Its snapshot date is October 2, 2026; Kevin is a fictional demo character and all events, organizations, and amounts in that case are invented.

The Sapini export is **sample data, not a verified live connection**. It contains truncated fields, incomplete communications, and a document inventory rather than PDF contents. These limits appear in the UI. Digestion excludes the export's analytical/derived sections. The analyzed `sapini-case-file.json` is not used as factual input.

Records use an explicit snapshot date: waiting age and urgency are relative to that date, not an invented current case state. Missing information stays unknown. Amounts are recorded source assertions and are not settlement predictions or verified balances.

## Finances

Open **Finances** in the workspace navigation for the selected matter. Summary cards show medical charges, insurer payments, patient payments, and the remaining patient responsibility explicitly recorded in provider statements. Expand a provider for adjustments, statement balances, pending and denied insurance amounts, and the original supporting records. Search and filter providers or export the complete ledger as CSV.

Missing amounts display **Not recorded**, never zero. Totals across incomplete records are labeled **Partial total**. Recorded charges are not assumed to be unpaid, and a denial does not establish patient responsibility. Policy limits, liens, and firm accounting fields are kept out of medical payment totals. The **Other financial records** panel retains separate case-level context. **Confirmed** means a statement explicitly supplies that status, not independent verification by the app.

Billing snapshots can be imported through the existing JSON matter import. Include an `expense` or `note` source with a date and the following original, explicitly labeled text. These fields describe **cumulative provider totals** at that date; the latest snapshot replaces earlier snapshots from the same provider. Fields may be omitted or set to `Unknown`. Reimporting a matter replaces its full cached snapshot, so include the other source records you intend to retain.

```text
Provider: Example Medical Center
Billed: $2,000.00
Insurance paid: $1,200.00
Patient paid: $100.00
Adjustments: $400.00
Outstanding balance: $300.00
Patient responsibility: $300.00
Insurance pending: $0.00
Insurance denied: $0.00
Status: confirmed
```

Supported statuses are `confirmed`, `recorded`, `pending`, `disputed`, and `unknown`. Unknown or conflicting amounts stay unresolved. Source document inventory entries do not count as payment evidence. Original provider charge lines in compatible text exports are also supported; absent payment details stay unknown.

For a complete, explicitly fictional payment example, import [finances-example.json](fixtures/finances-example.json) as a separate matter. It includes confirmed payments, pending insurance, a disputed denial, missing payment records, and an earlier statement that must not be counted twice.

## Connect Clio

1. Register a Clio Manage developer application in the region of your seeded account, with permission to **read** the relevant case resources.
2. Copy `.env.example` to `.env`. Fill `CLIO_CLIENT_ID`, `CLIO_CLIENT_SECRET`, and `CLIO_REGION` (`US`, `CA`, `EU`, or `AU`). Register the exact redirect URI `http://127.0.0.1:4310/api/clio/callback` in Clio. If you change the port, also update the callback.
3. Restart the app, use **Connect Clio** in the connection screen, and complete Clio authorization in your own browser.
4. Use **Refresh from Clio** to import. Inspect any warnings for permissions or incomplete collections. The sample matter remains separately labeled.

An existing `CLIO_ACCESS_TOKEN` can also be supplied server-side; OAuth is preferable for renewable access. OAuth tokens are stored only in the server's ignored `.data/` directory, never in browser storage or source control. Token exchange/refresh uses OAuth POST requests; case resource operations use GET only. The app never creates, updates, or deletes Clio case data. Live availability must be verified against your own account; mocked integration tests do not establish a live connection.

## Configuration

Copy `.env.example` to `.env` if you need to change the defaults. Restart the server after editing it. Never commit `.env` or credentials.

| Variable | Purpose / default |
| --- | --- |
| `APP_PASSWORD` | Local workspace password; defaults to `123` when unset or empty. |
| `PORT` | HTTP port; defaults to `4310`. Development also uses the next port for hot reload. |
| `SAMPLE_CASE_PATH` | Optional compatible text export for initial sample loading. |
| `CLIO_CLIENT_ID` | Your Clio OAuth application's client ID. |
| `CLIO_CLIENT_SECRET` | Server-side Clio OAuth secret. |
| `CLIO_REDIRECT_URI` | Callback URL, normally `http://127.0.0.1:4310/api/clio/callback`. |
| `CLIO_REGION` | `US`, `CA`, `EU`, or `AU`; defaults to `US`. |
| `CLIO_ACCESS_TOKEN` | Optional existing server-side access token instead of an OAuth connection. |

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

This draft uses deterministic extraction and keyword rules. It does not call a hosted language model. Blockers come from recorded open tasks; request matching, ownership suggestions, and next actions need attorney review. It does not infer every possible blocker from arbitrary documents. Document binaries/OCR, automatic legal deadline conclusions, settlement prediction, chat, and outbound messaging are outside this draft.

Local access is intended for one attorney workspace. Provider requests are filtered server-side. Share tokens are random, stored as hashes, expire after seven days, and can be revoked. They grant access to anyone holding the link; provider identity is not independently verified. A public deployment would require proper staff/provider authentication, HTTPS, encrypted storage and operational controls. The current server intentionally listens on loopback only.

Runtime data and tokens live in ignored `.data/dashboard.sqlite` with restrictive file permissions. This is local persistence, not an encrypted vault. Do not commit `.data`, `.env`, original case files, or screenshots containing private case information.

## Development

```sh
npm test
npm run build
npm start
```

`npm test` runs the Node test suite. `npm run build` checks TypeScript and builds the frontend into `dist/`. `npm start` serves that build locally; rebuild after frontend changes, or use `npm run dev` while developing.

- `src/` contains the React views and styles.
- `server/` contains authentication, imports, Clio access, source extraction, and SQLite storage.
- `shared/` contains the matter types and helpers for summaries, injuries, and finances.
- `fixtures/` contains fictional demo data and walkthroughs.
- `tests/` covers imports, extraction, Clio request boundaries, provider sharing, and the shared helpers.

For contributions, keep findings linked to their original sources, leave absent values unknown, and add tests for changed parsing or permission behavior. Use fictional fixtures rather than private case files. Run `npm test` and `npm run build` before opening a pull request.

## Troubleshooting

- If a private access link has expired, open the base URL and use the configured password. Restarting creates a new one-time link and ends previous sessions.
- If the port is in use, stop the other local instance or set `PORT` in `.env`. Update the Clio callback URL to match.
- If the UI looks unchanged after an edit, use development mode or run `npm run build`, then refresh the browser.
- If Clio is unavailable, keep using the labeled samples. Check the connection screen for missing settings and refresh warnings; the presence of a connector does not mean live access is working.
- If startup cannot load `SAMPLE_CASE_PATH`, check the file path and permissions or remove the override to use the bundled fallback.

## License

[MIT](LICENSE).
