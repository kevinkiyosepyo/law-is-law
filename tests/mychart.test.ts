import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadKevinPyoSample } from "../server/sample.ts";
import { parseTextExport } from "../server/digest.ts";
import { connectChartDemo, emptyChartSession, filterChartRecords, getChartDemoRecords, previewChartSharing, validateChartDraft, type ChartDraft } from "../shared/mychart.ts";

test("Kevin's portal walkthrough is fictional, traceable, and distinct from an email notification", () => {
  const matter = loadKevinPyoSample();
  const before = JSON.stringify(matter);
  const records = getChartDemoRecords(matter);
  assert.equal(records.length, 6);
  assert.deepEqual(new Set(records.map((r) => r.kind)), new Set(["record", "message", "appointment", "billing", "notification"]));
  assert.equal(new Set(records.map((r) => r.id)).size, records.length);
  for (const record of records) {
    assert.equal(record.origin, "fictional");
    assert.ok(record.date <= matter.asOf);
    if (record.kind !== "notification") assert.ok(matter.sources.some((s) => s.id === record.sourceId));
  }
  assert.match(records.find((r) => r.kind === "appointment")!.body, /not a booked revision/);
  assert.match(records.find((r) => r.kind === "billing")!.body, /does not establish final patient responsibility/);
  assert.equal(JSON.stringify(matter), before);
});

test("other samples use their own treatment excerpt and never receive Kevin's clinical story", () => {
  const matter = parseTextExport(readFileSync(new URL("../fixtures/example-case.txt", import.meta.url), "utf8"), "sample");
  const records = getChartDemoRecords(matter);
  assert.ok(records.some((r) => r.origin === "case-excerpt"));
  assert.ok(!JSON.stringify(records).includes("Kevin"));
  assert.ok(!JSON.stringify(records).includes("Aldercrest"));
  assert.ok(records.every((r) => r.id.startsWith(matter.id)));
});

test("live and imported matters never receive invented portal records", () => {
  for (const sourceMode of ["import", "clio"] as const) {
    const matter = { ...loadKevinPyoSample(), sourceMode };
    assert.deepEqual(getChartDemoRecords(matter), []);
    assert.equal(connectChartDemo(emptyChartSession, matter), emptyChartSession);
  }
});

test("connecting and reconnecting are idempotent and do not auto-share records", () => {
  const matter = loadKevinPyoSample();
  const session = connectChartDemo(emptyChartSession, matter);
  assert.equal(session.connected, true);
  assert.equal(session.records.length, 6);
  assert.deepEqual(session.sharedIds, []);
  assert.deepEqual(emptyChartSession, { connected: false, records: [], sharedIds: [] });
  assert.deepEqual(connectChartDemo({ ...session, connected: false }, matter), session);
});

test("attorney preview requires review, excludes unknown ids and notifications, and deduplicates", () => {
  const session = connectChartDemo(emptyChartSession, loadKevinPyoSample());
  const ids = session.records.map((r) => r.id);
  assert.equal(previewChartSharing(session, ids, false), session);
  const shared = previewChartSharing(session, [...ids, "different-matter-record"], true);
  assert.equal(shared.sharedIds.length, 5);
  assert.ok(!shared.sharedIds.includes(session.records.find((r) => r.kind === "notification")!.id));
  assert.deepEqual(previewChartSharing(shared, ids, true), shared);
  assert.deepEqual(session.sharedIds, []);
  const revoked = { ...shared, sharedIds: shared.sharedIds.slice(1) };
  assert.equal(revoked.sharedIds.length, 4);
  assert.equal(revoked.records.length, 6);
});

test("filters search provider and body, combine with categories, and leave input untouched", () => {
  const records = getChartDemoRecords(loadKevinPyoSample());
  const ids = records.map((r) => r.id);
  assert.equal(filterChartRecords(records, "all", "  aldercrest ").length, 2);
  assert.equal(filterChartRecords(records, "message", "aldercrest").length, 1);
  assert.equal(filterChartRecords(records, "billing", "corrected").length, 1);
  assert.equal(filterChartRecords(records, "record", "no such phrase").length, 0);
  const sorted = filterChartRecords(records, "all", "");
  assert.ok(sorted.every((r, index) => index === 0 || r.date <= sorted[index - 1].date));
  assert.deepEqual(records.map((r) => r.id), ids);
});

test("manual record validation rejects missing text, excessive length, invalid types and invalid dates", () => {
  const draft: ChartDraft = { title: "Demo summary", provider: "Example care", date: "2026-10-02", kind: "record", body: "Fictional record text" };
  assert.equal(validateChartDraft(draft), null);
  for (const key of ["title", "provider", "body"] as const) assert.ok(validateChartDraft({ ...draft, [key]: "  " }));
  assert.ok(validateChartDraft({ ...draft, body: "x".repeat(20001) }));
  assert.ok(validateChartDraft({ ...draft, title: "x".repeat(181) }));
  assert.ok(validateChartDraft({ ...draft, kind: "__proto__" }));
  for (const date of ["", "2026-02-30", "2026-13-01", "2026-1-1", "not a date"]) assert.ok(validateChartDraft({ ...draft, date }));
  assert.equal(validateChartDraft({ ...draft, date: "2028-02-29" }), null);
});
