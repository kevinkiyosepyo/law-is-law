import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { digestMatter, parseTextExport } from "../server/digest.ts";
import type { SourceRecord } from "../shared/types.ts";

const example = readFileSync(
  fileURLToPath(new URL("../fixtures/example-case.txt", import.meta.url)),
  "utf8",
);
const suppliedPath =
  "/Users/kevinpoopz/Desktop/Law is law/sapini-case-file.txt";

test("text ingestion supports a different matter without case-specific conclusions", () => {
  const matter = parseTextExport(example);
  assert.equal(matter.number, "DEMO-204");
  assert.equal(matter.clientName, "Morgan Example");
  assert.equal(matter.asOf, "2026-10-02");
  assert.equal(matter.blockers.length, 2);
  assert.equal(matter.providers.length, 1);
  assert.equal(matter.blockers[0].owner, "Example River Therapy");
  assert.equal(matter.blockers[0].priority, "high");
  assert.equal(matter.blockers[0].requestedAt, "2026-09-24");
  assert.equal(matter.blockers[1].requestedAt, undefined);
  assert.equal(matter.blockers[1].status, "needs_review");
  assert.equal(matter.blockers[1].owner, "Morgan Example");
  assert.ok(
    matter.facts.some(
      (f) => f.label === "Policy Limits" && f.certainty === "unknown",
    ),
  );
  assert.ok(
    !JSON.stringify(matter).match(/Sapini|McCulloch|118,400|375,000|43,076/),
  );
});

test("every finding references existing sources and text locators reproduce original evidence", () => {
  const matter = parseTextExport(example);
  const sourceIds = new Set(matter.sources.map((s) => s.id));
  const lines = example.split("\n");
  for (const source of matter.sources) {
    const location = source.locator!.match(/lines (\d+)–(\d+)/)!;
    assert.equal(
      source.text,
      lines.slice(Number(location[1]) - 1, Number(location[2])).join("\n"),
    );
  }
  for (const item of [...matter.facts, ...matter.blockers, ...matter.events]) {
    item.sourceIds.forEach((id) =>
      assert.ok(sourceIds.has(id), `Missing source ${id}`),
    );
    if ("certainty" in item && item.certainty === "unknown") continue;
    assert.ok(item.sourceIds.length > 0);
  }
  assert.equal(
    new Set(matter.sources.map((s) => s.id)).size,
    matter.sources.length,
  );
});

test("analytical sections and multiline editorial observations do not become evidence or tasks", () => {
  const matter = parseTextExport(
    `${example}\nOBSERVATION: This is an interpretation.\n2026-10-03 is not another event.\n\nSECTION 10 — DERIVED FIGURES\nRECOVERY WATERFALL: $99,123 net to client.\n\nSECTION 11 — WHAT THIS FILE CONTAINS FOR A CASE-DIGESTION PRODUCT\nMake up some missing documents.\n`,
  );
  assert.ok(
    !matter.sources.some((s) =>
      /RECOVERY WATERFALL|99,123|Make up|is not another event/.test(s.text),
    ),
  );
  assert.equal(matter.blockers.length, 2);
  assert.ok(!matter.events.some((e) => e.date === "2026-10-03"));
});

test("normalized Clio-style tasks use recorded due dates and omit completed tasks", () => {
  const sources: SourceRecord[] = [
    {
      id: "open",
      type: "task",
      title: "Review records",
      text: "Status: Pending\nAssigned: Alex Attorney\nDue: 2026-10-01",
      date: "2026-09-01",
    },
    {
      id: "done",
      type: "task",
      title: "Completed task",
      text: "Status: Completed\nDue: 2026-09-01",
    },
    {
      id: "unknown",
      type: "task",
      title: "Review undated item",
      text: "Status: Pending",
    },
    {
      id: "limit",
      type: "field",
      title: "Policy Limits",
      text: "$75,000 (unverified)",
    },
    {
      id: "valuation",
      type: "field",
      title: "Estimated Case Value",
      text: "$950,000",
    },
  ];
  const matter = digestMatter(
    {
      id: "other",
      number: "OTHER-1",
      clientName: "Riley Fiction",
      description: "Another case",
      status: "Open",
      stage: "Intake",
      sourceMode: "clio",
      importedAt: "2026-10-02T12:00:00Z",
      asOf: "2026-10-02",
    },
    sources,
  );
  assert.equal(matter.blockers.length, 2);
  assert.equal(matter.blockers[0].dueAt, "2026-10-01");
  assert.equal(matter.blockers[0].priority, "high");
  assert.equal(matter.blockers[0].owner, "Alex Attorney");
  assert.equal(matter.blockers[1].dueAt, undefined);
  assert.equal(matter.blockers[1].owner, "Owner not recorded");
  assert.ok(!matter.facts.some((f) => f.label === "Estimated Case Value"));
  assert.ok(
    matter.facts.some(
      (f) => f.category === "treatment" && f.certainty === "unknown",
    ),
  );
  assert.ok(
    matter.facts.some(
      (f) => f.category === "financial" && f.certainty === "unknown",
    ),
  );
});

test("a recorded response requires review instead of asserting the provider is still silent", () => {
  const text = example.replace(
    "SECTION 6 — NOTES",
    `2026-09-28  Example River Therapy > Avery Demo\n  Updated treatment notes — Attached are all requested treatment notes.\n\nSECTION 6 — NOTES`,
  );
  const matter = parseTextExport(text);
  assert.equal(matter.blockers[0].status, "needs_review");
  assert.equal(matter.blockers[0].lastActivityAt, "2026-09-28");
});

test("empty exports are rejected and unstructured notes retain explicit unknowns", () => {
  assert.throws(() => parseTextExport("  "), /empty/);
  const matter = parseTextExport(
    "A short intake note without fields or dates.",
  );
  assert.equal(matter.sources.length, 1);
  assert.equal(matter.blockers.length, 0);
  assert.equal(matter.facts.filter((f) => f.certainty === "unknown").length, 3);
  assert.equal(matter.incidentDate, undefined);
});

test(
  "supplied raw case yields six actual tasks with sourced waiting history",
  { skip: !existsSync(suppliedPath) },
  () => {
    const matter = parseTextExport(
      readFileSync(suppliedPath, "utf8"),
      "sample",
    );
    assert.equal(matter.clientName, "Justin Sapini");
    assert.equal(matter.blockers.length, 6);
    assert.equal(
      matter.blockers.filter((b) => b.priority === "high").length,
      2,
    );
    assert.equal(matter.blockers[0].requestedAt, "2026-05-05");
    assert.equal(matter.blockers[0].lastActivityAt, "2026-09-24");
    assert.equal(matter.blockers[0].status, "received_incomplete");
    assert.ok(
      !matter.facts.some((f) =>
        /valuation|estimated case value|recovery|client reference/i.test(
          f.label,
        ),
      ),
    );
    assert.ok(
      !matter.sources.some((s) =>
        /RECOVERY WATERFALL|NET TO CLIENT|LIMITATIONS DATE DISCREPANCY/.test(
          s.text,
        ),
      ),
    );
    assert.ok(
      !matter.blockers.some((b) => /insurance|declarations/i.test(b.title)),
    );
    assert.equal(matter.providers.length, 10);
    assert.ok(matter.warnings.some((w) => w.includes("truncated")));
  },
);
