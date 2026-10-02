import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { deriveFinances } from "../shared/finances.ts";
import { importMatter } from "../server/import.ts";
import type { MatterSnapshot, SourceRecord } from "../shared/types.ts";

const provider = { id: "river", name: "River Therapy" };
function matter(sources: SourceRecord[], providers = [provider]): MatterSnapshot {
  return {
    id: "test", number: "TEST", clientName: "Test", description: "Test",
    status: "Open", stage: "Treatment", sourceMode: "import",
    asOf: "2026-10-02", importedAt: "2026-10-02T00:00:00.000Z",
    sources, providers, facts: [], blockers: [], events: [], warnings: [],
  };
}
function snapshot(text: string, options: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "bill", type: "note", date: "2026-10-01", title: "Medical billing snapshot",
    text: `Provider: River Therapy\n${text}`, ...options,
  };
}

test("explicit zero is known, absent payments and liability remain unknown", () => {
  const result = deriveFinances(matter([snapshot("Billed: $1,000.00\nPatient paid: $0.00\nStatus: confirmed")]));
  assert.equal(result.totals.billed.amount, 100000);
  assert.equal(result.totals.patientPaid.amount, 0);
  assert.equal(result.totals.patientPaid.state, "recorded");
  assert.equal(result.totals.patientPaid.confirmedCount, 1);
  assert.equal(result.totals.insurancePaid.amount, null);
  assert.equal(result.totals.outstanding.amount, null);
  assert.equal(result.totals.patientResponsibility.amount, null);
  assert.equal(result.totals.insurancePaid.state, "unknown");
  assert.deepEqual(result.rows[0].sourceIds, ["bill"]);
});

test("charges less payments do not establish patient liability or insurer denials", () => {
  const result = deriveFinances(matter([snapshot([
    "Billed: $500.00", "Insurance paid: $100.00", "Patient paid: $50.00",
    "Adjustments: $25.00", "Outstanding balance: $325.00", "Insurance denied: $200.00",
    "Status: pending",
  ].join("\n"))]));
  assert.equal(result.totals.outstanding.amount, 32500);
  assert.equal(result.totals.insuranceDenied.amount, 20000);
  assert.equal(result.totals.patientResponsibility.amount, null);
  assert.equal(result.totals.insurancePending.amount, null);
  assert.equal(result.rows[0].status, "pending");
});

test("sum integer cents and identify partial coverage of providers", () => {
  const result = deriveFinances(matter([
    snapshot("Billed: $0.10\nInsurance paid: $0.00", { id: "a" }),
    snapshot("Provider: Lake Hospital\nBilled: $0.20", { id: "b", text: "Provider: Lake Hospital\nBilled: $0.20" }),
  ], [provider, { id: "lake", name: "Lake Hospital" }]));
  assert.equal(result.totals.billed.amount, 30);
  assert.equal(result.totals.billed.state, "recorded");
  assert.deepEqual(result.totals.insurancePaid, {
    amount: 0, knownCount: 1, totalCount: 2, confirmedCount: 0, state: "partial",
  });
});

test("latest cumulative snapshot replaces older values without backfilling unknowns", () => {
  const sources = [
    snapshot("Billed: $800.00\nPatient paid: $25.00\nPatient responsibility: $150.00", { id: "older", date: "2026-09-01" }),
    snapshot("Billed: $1,000.00\nPatient paid: $50.00", { id: "newer" }),
    snapshot("Billed: $1,000.00\nPatient paid: $50.00", { id: "copy" }),
  ];
  const result = deriveFinances(matter(sources));
  assert.equal(result.rows.length, 1);
  assert.equal(result.totals.billed.amount, 100000);
  assert.equal(result.totals.patientPaid.amount, 5000);
  assert.equal(result.totals.patientResponsibility.amount, null);
  assert.deepEqual(result.rows[0].sourceIds.sort(), ["copy", "newer"]);
});

test("conflicting same-date snapshots keep agreement and flag disputed amounts", () => {
  const result = deriveFinances(matter([
    snapshot("Billed: $100.00\nPatient paid: $20.00\nStatus: confirmed", { id: "a" }),
    snapshot("Billed: $100.00\nPatient paid: $30.00\nStatus: confirmed", { id: "b" }),
  ]));
  assert.equal(result.totals.billed.amount, 10000);
  assert.equal(result.totals.patientPaid.amount, null);
  assert.equal(result.rows[0].status, "disputed");
  assert.deepEqual(result.rows[0].sourceIds, ["a", "b"]);
});

test("a duplicate contradictory field cannot be resolved by a later status line", () => {
  const result = deriveFinances(matter([snapshot("Billed: $100.00\nBilled: $200.00\nStatus: confirmed")]));
  assert.equal(result.totals.billed.amount, null);
  assert.equal(result.rows[0].status, "disputed");
});

test("complementary same-day statements keep known amounts without inventing a conflict", () => {
  const input = matter([
    snapshot("Billed: $100.00\nStatus: unknown", { id: "brief" }),
    snapshot("Billed: $100.00\nPatient paid: $20.00\nStatus: confirmed", { id: "detailed" }),
  ]);
  for (const sources of [input.sources, [...input.sources].reverse()]) {
    const result = deriveFinances({ ...input, sources });
    assert.equal(result.totals.patientPaid.amount, 2000);
    assert.equal(result.rows[0].status, "recorded");
    assert.equal(result.totals.patientResponsibility.amount, null);
  }
});

test("a conflicting field within a statement stays unresolved when another statement supplies a value", () => {
  const result = deriveFinances(matter([
    snapshot("Billed: $100\nPatient paid: $20\nPatient paid: $30", { id: "conflict" }),
    snapshot("Billed: $100\nPatient paid: $20", { id: "other" }),
  ]));
  assert.equal(result.rows[0].status, "disputed");
  assert.equal(result.totals.patientPaid.amount, null);
});

test("a confirmed statement with inconsistent arithmetic is flagged without rewriting source amounts", () => {
  const result = deriveFinances(matter([snapshot([
    "Billed: $100", "Insurance paid: $50", "Patient paid: $10",
    "Adjustments: $20", "Outstanding balance: $30", "Status: confirmed",
  ].join("\n"))]));
  assert.equal(result.rows[0].status, "disputed");
  assert.equal(result.totals.outstanding.amount, 3000);
  assert.equal(result.totals.outstanding.confirmedCount, 0);
  assert.ok(result.rows[0].notes.some((note) => note.includes("do not equal")));
});

test("patient responsibility exceeding the statement balance requires reconciliation", () => {
  const result = deriveFinances(matter([snapshot("Outstanding balance: $20\nPatient responsibility: $40\nStatus: confirmed")]));
  assert.equal(result.rows[0].status, "disputed");
  assert.equal(result.totals.patientResponsibility.amount, 4000);
});

test("distinct original bills are not silently treated as cumulative provider statements", () => {
  const sources: SourceRecord[] = [
    { id: "first", type: "expense", title: "Treatment", date: "2026-09-01", text: "2026-09-01 River Therapy $100.00" },
    { id: "second", type: "expense", title: "Treatment", date: "2026-10-01", text: "2026-10-01 River Therapy $200.00" },
  ];
  const uncertain = deriveFinances(matter(sources));
  assert.equal(uncertain.totals.billed.amount, null);
  assert.equal(uncertain.rows[0].status, "disputed");
  assert.deepEqual(uncertain.rows[0].sourceIds.sort(), ["first", "second"]);
  const reconciled = deriveFinances(matter([...sources, snapshot("Billed: $300.00\nStatus: confirmed", { id: "cumulative" })]));
  assert.equal(reconciled.totals.billed.amount, 30000);
  assert.equal(reconciled.rows[0].status, "confirmed");
});

test("identical duplicate original bill records are counted once", () => {
  const bill: SourceRecord = { id: "one", type: "expense", title: "Treatment", date: "2026-10-01", text: "2026-10-01 River Therapy $100.00" };
  const result = deriveFinances(matter([bill, { ...bill, id: "copy" }]));
  assert.equal(result.totals.billed.amount, 10000);
  assert.equal(result.rows[0].status, "recorded");
});

test("firm account balances, policy limits, exhausted benefits, liens and document metadata never become medical payments", () => {
  const sources: SourceRecord[] = [
    { id: "balance", type: "field", title: "Outstanding balance", text: "Outstanding balance: $0.00" },
    { id: "policy", type: "field", title: "Policy Limits", text: "$100,000 liability; $50,000 no-fault" },
    { id: "exhausted", type: "note", title: "No-fault exhausted", text: "Insurance confirms $50,000 in no-fault benefits exhausted." },
    { id: "lien", type: "note", title: "Medicaid lien", text: "Medicaid lien asserted at $22,180.00." },
    snapshot("Billed: $99,000.00\nInsurance paid: $50,000.00", { id: "document", type: "document" }),
    { id: "firm", type: "expense", title: "Records reproduction", text: "2026-09-01 River Therapy $65.00\nRecords reproduction: paid by firm." },
  ];
  const input = matter(sources);
  input.facts = [{ id: "balance-fact", category: "financial", label: "Outstanding balance", value: "$0.00", certainty: "recorded", sourceIds: ["balance"] }];
  const result = deriveFinances(input);
  assert.equal(result.rows[0].status, "unknown");
  assert.ok(Object.values(result.totals).every((value) => value.amount === null));
  assert.equal(result.facts.length, 1, "Keep separately attributed matter-level financial context");
});

test("future records do not replace a current ledger or create current financial facts", () => {
  const input = matter([
    snapshot("Billed: $100.00", { id: "current" }),
    snapshot("Billed: $999.00", { id: "future", date: "2026-10-03" }),
    snapshot("Billed: $888.00", { id: "inline-date", date: undefined, text: "2026-10-04 — Medical billing snapshot\nProvider: River Therapy\nBilled: $888.00" }),
  ]);
  input.facts = [{ id: "future-fact", category: "financial", label: "Medical bills", value: "$999", certainty: "recorded", sourceIds: ["future"] }];
  const result = deriveFinances(input);
  assert.equal(result.totals.billed.amount, 10000);
  assert.deepEqual(result.rows[0].sourceIds, ["current"]);
  assert.equal(result.facts.length, 0);
});

test("unstructured provider expense records accept exact or unambiguous abbreviated names", () => {
  const result = deriveFinances(matter([
    { id: "raw", type: "expense", title: "River Therapy", date: "2026-09-01", text: "2026-09-01 River Therapy $2,400.00\nservices through September; payment status unknown" },
  ], [{ id: "river", name: "River Therapy of New York, PLLC" }]));
  assert.equal(result.totals.billed.amount, 240000);
  assert.equal(result.rows[0].providerId, "river");
  assert.equal(result.totals.patientPaid.amount, null);
  assert.equal(result.totals.outstanding.amount, null);
});

test("ambiguous and generic provider names are not assigned to one of multiple providers", () => {
  const result = deriveFinances(matter([
    { id: "ambiguous", type: "expense", title: "Therapy", text: "2026-09-01 River Therapy $500.00" },
    { id: "generic", type: "expense", title: "Therapy", text: "2026-09-01 Therapy $600.00" },
  ], [{ id: "east", name: "River Therapy East" }, { id: "west", name: "River Therapy West" }]));
  assert.equal(result.totals.billed.amount, null);
  assert.ok(result.rows.every((row) => row.sourceIds.length === 0));
});

test("approximate, negative, range and malformed amounts stay unknown", () => {
  for (const value of ["Unknown", "$1,000 estimated", "$100–$200", "-$100.00", "$1,23.00", "$0.001", "9007199254740991000"]) {
    const result = deriveFinances(matter([snapshot(`Billed: ${value}`)]));
    assert.equal(result.totals.billed.amount, null, value);
  }
});

test("empty matters and providers lacking records report unknown rather than a zero total", () => {
  const empty = deriveFinances(matter([], []));
  assert.equal(empty.rows.length, 0);
  assert.equal(empty.totals.billed.amount, null);
  assert.equal(empty.totals.billed.totalCount, 0);
  const partial = deriveFinances(matter([snapshot("Billed: $100.00")], [provider, { id: "other", name: "Other Hospital" }]));
  assert.equal(partial.rows.length, 2);
  assert.equal(partial.totals.billed.state, "partial");
  assert.equal(partial.totals.billed.knownCount, 1);
});

test("the nine Sapini provider bills total $118,400 without inventing payment data", () => {
  // Original charge descriptions and amounts from the supplied case export.
  const providers = [
    "Advanced Rockland Chiropractic Offices, P.C.",
    "McCulloch Orthopaedic Surgical Services, PLLC",
    "SportsCare Physical Therapy of New York", "Peter C. Kwan", "Melinda L. Miller",
    "Interventional Physical Medicine & Rehabilitation, P.C.",
    "Hudson Valley Radiology Associates", "New Horizon Surgical Center, LLC",
    "Montefiore Nyack Hospital", "David Capiola",
  ].map((name, index) => ({ id: `provider-${index}`, name }));
  const lines = [
    "2024-08-15  Advanced Rockland Chiropractic      $14,220.00",
    "2024-05-27  McCulloch Orthopaedic                $9,530.00",
    "2023-12-14  SportsCare Physical Therapy          $5,825.00",
    "2023-12-12  Peter C. Kwan, M.D. (neurology)      $3,200.00",
    "2023-09-20  Melinda L. Miller, M.D. (EMG/NCV)    $4,800.00",
    "2023-09-07  Interventional PM&R                  $1,450.00",
    "2023-08-08  Hudson Valley Radiology             $15,900.00",
    "2023-07-26  New Horizon Surgical Center         $60,000.00",
    "2023-04-24  Montefiore Nyack Hospital            $3,475.00",
  ];
  const sources = lines.map((line, index): SourceRecord => ({
    id: `bill-${index}`, type: "expense", title: line.slice(12), date: line.slice(0, 10),
    text: `${line}\nservices as recorded; payment status unknown`,
  }));
  const result = deriveFinances(matter(sources, providers));
  assert.equal(result.totals.billed.amount, 11840000);
  assert.equal(result.totals.billed.knownCount, 9);
  assert.equal(result.totals.billed.totalCount, 10);
  assert.equal(result.totals.insurancePaid.amount, null);
  assert.equal(result.totals.patientPaid.amount, null);
  assert.equal(result.totals.patientResponsibility.amount, null);
  assert.equal(result.totals.outstanding.amount, null);
  assert.equal(result.rows.filter((row) => row.sourceIds.length > 0).length, 9);
});

test("published fictional finance example imports with exact, traceable current balances", () => {
  const input = importMatter(readFileSync(new URL("../fixtures/finances-example.json", import.meta.url), "utf8"), "finances-example.json");
  const result = deriveFinances(input);
  const expected = {
    billed: 3611575, insurancePaid: 2084010, patientPaid: 95000, adjustments: 675015,
    outstanding: 630000, patientResponsibility: 130000, insurancePending: 250000, insuranceDenied: 220000,
  };
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(result.totals[key as keyof typeof expected].amount, value, key);
  }
  assert.equal(result.rows.length, 4);
  assert.equal(result.totals.billed.state, "recorded");
  assert.equal(result.totals.patientResponsibility.state, "partial");
  const sourceIds = new Set(input.sources.map((source) => source.id));
  assert.ok(result.rows.every((row) => row.sourceIds.length && row.sourceIds.every((id) => sourceIds.has(id))));
});
