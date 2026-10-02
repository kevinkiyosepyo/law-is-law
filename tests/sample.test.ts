import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadKevinPyoSample, seedSamples } from "../server/sample.ts";
import { parseTextExport } from "../server/digest.ts";
import { Store } from "../server/store.ts";
import { shortSummary } from "../shared/short-summary.ts";
import { deriveFinances } from "../shared/finances.ts";

const fixtureUrl = new URL("../fixtures/kevin-pyo-car-crash.txt", import.meta.url);
const exampleUrl = new URL("../fixtures/example-case.txt", import.meta.url);

test("Kevin's sample has complete provider payment statements with reconciled balances and hospital assistance", () => {
  const matter = loadKevinPyoSample();
  const finances = deriveFinances(matter);
  assert.equal(finances.rows.length, 6);
  const expected = { billed: 8346000, insurancePaid: 4900000, patientPaid: 300000, adjustments: 1840000, outstanding: 1306000, patientResponsibility: 401000, insurancePending: 700000, insuranceDenied: 205000 };
  for (const [key, total] of Object.entries(finances.totals)) {
    assert.equal(total.amount, expected[key as keyof typeof expected]);
    assert.equal(total.knownCount, 6);
    assert.equal(total.state, "recorded");
  }
  for (const row of finances.rows) {
    assert.ok(Object.values(row.amounts).every((amount) => amount !== null));
    const a = row.amounts as Record<keyof typeof expected, number>;
    assert.equal(a.billed, a.insurancePaid + a.patientPaid + a.adjustments + a.outstanding);
    assert.equal(a.outstanding, a.patientResponsibility + a.insurancePending + a.insuranceDenied);
    assert.equal(row.date, "2026-10-01");
    assert.equal(row.sourceIds.length, 1);
  }
  const hospital = finances.rows.find((row) => row.providerName === "Sable Harbor Emergency Hospital")!;
  assert.equal(hospital.amounts.patientPaid, 90000);
  assert.equal(hospital.status, "confirmed");
  assert.ok(hospital.notes.some((note) => note.includes("$1,500 in financial assistance") && note.includes("four-payment plan")));
  assert.ok(!finances.facts.some((fact) => /Not recorded in this field/.test(fact.value)));
});

test("Kevin's fictional case produces a complete, traceable demo across the dashboard", () => {
  const raw = readFileSync(fixtureUrl, "utf8");
  const matter = loadKevinPyoSample();
  assert.equal(matter.clientName, "Kevin Pyo - Car Crash");
  assert.equal(matter.id, "sample-demo-kevin-003");
  assert.equal(matter.sourceMode, "sample");
  assert.equal(matter.asOf, "2026-10-02");
  assert.ok(matter.warnings.some((w) => /Fictional demonstration/.test(w)));
  assert.ok(matter.sources.length >= 80, "Include the full source history");
  assert.ok(matter.providers.length >= 5, "Include distinct treating providers");
  assert.ok(matter.blockers.length >= 12, "Include the unresolved case work");
  assert.deepEqual(new Set(matter.blockers.map((b) => b.status)), new Set([
    "awaiting_response", "received_incomplete", "needs_review", "not_requested", "unavailable",
  ]));
  assert.deepEqual(new Set(matter.blockers.map((b) => b.priority)), new Set([
    "high", "medium", "low",
  ]));
  assert.ok(matter.facts.some((f) => f.certainty === "unknown"));

  const lines = raw.split("\n");
  const sources = new Map(matter.sources.map((s) => [s.id, s]));
  assert.equal(sources.size, matter.sources.length);
  for (const source of matter.sources) {
    const location = source.locator!.match(/lines (\d+)–(\d+)/)!;
    assert.equal(source.text, lines.slice(+location[1] - 1, +location[2]).join("\n"));
  }
  for (const item of [...matter.facts, ...matter.blockers, ...matter.events]) {
    for (const id of item.sourceIds) assert.ok(sources.has(id), `Missing source ${id}`);
  }
  const completed = matter.sources.filter((s) =>
    s.type === "task" && /Status:\s*Completed/i.test(s.text));
  assert.ok(completed.length > 0, "Retain completed work in the history");
  for (const source of completed) {
    assert.ok(!matter.blockers.some((b) => b.sourceIds.includes(source.id)));
  }
  for (const blocker of matter.blockers) {
    if (blocker.providerId) {
      assert.equal(matter.providers.find((p) => p.id === blocker.providerId)?.name, blocker.owner);
    }
    if (blocker.requestedAt) assert.ok(blocker.requestedAt <= matter.asOf);
    if (blocker.lastActivityAt) assert.ok(blocker.lastActivityAt <= matter.asOf);
  }
  const summary = shortSummary(matter.sources);
  assert.ok(summary.every((line) => line.sourceIds.length > 0));
  assert.match(summary.map((line) => line.text).join(" "), /Kevin|collision|crash/i);
  assert.match(summary.map((line) => line.text).join(" "), /forearm|arm|neck/i);
});

test("startup adds all demos on fresh and existing workspaces without replacing saved cases", () => {
  const previous = process.env.SAMPLE_CASE_PATH;
  process.env.SAMPLE_CASE_PATH = fileURLToPath(exampleUrl);
  const fresh = new Store(":memory:");
  const existing = new Store(":memory:");
  try {
    seedSamples(fresh);
    assert.deepEqual(fresh.listMatters().map((m) => m.clientName).sort(), [
      "Ethan Brooks - Dog Bite", "Kevin Pyo - Car Crash", "Maya Torres - Slip and Fall", "Morgan Example", "Nina Patel - Rideshare Collision",
    ]);
    const sample = parseTextExport(readFileSync(exampleUrl, "utf8"), "sample");
    const imported = parseTextExport(readFileSync(exampleUrl, "utf8"), "import");
    imported.description = "Saved user import must remain unchanged";
    existing.saveMatter(sample);
    existing.saveMatter(imported);
    seedSamples(existing);
    assert.equal(existing.listMatters().length, 6);
    assert.deepEqual(existing.getMatter(sample.id), sample);
    assert.deepEqual(existing.getMatter(imported.id), imported);
    const kevin = existing.getMatter("sample-demo-kevin-003")!;
    kevin.description = "Saved Kevin snapshot must remain unchanged on restart";
    existing.saveMatter(kevin);
    seedSamples(existing);
    assert.equal(existing.listMatters().length, 6);
    assert.deepEqual(existing.getMatter(kevin.id), kevin);
  } finally {
    fresh.close();
    existing.close();
    if (previous === undefined) delete process.env.SAMPLE_CASE_PATH;
    else process.env.SAMPLE_CASE_PATH = previous;
  }
});

test("the three short demo claims have distinct clients, treatment, and open work", () => {
  const fixtures = [
    ["maya-torres-slip-fall.txt", "Maya Torres - Slip and Fall", "Investigation"],
    ["ethan-brooks-dog-bite.txt", "Ethan Brooks - Dog Bite", "Treatment"],
    ["nina-patel-rideshare.txt", "Nina Patel - Rideshare Collision", "Negotiation"],
  ];
  for (const [filename, client, stage] of fixtures) {
    const matter = parseTextExport(readFileSync(new URL(`../fixtures/${filename}`, import.meta.url), "utf8"), "sample");
    assert.equal(matter.clientName, client);
    assert.equal(matter.stage, stage);
    assert.equal(matter.providers.length, 1);
    assert.ok(matter.blockers.length >= 1);
    assert.ok(matter.facts.some((fact) => fact.category === "treatment"));
    assert.ok(matter.sources.some((source) => source.title === "Case Summary"));
  }
});
