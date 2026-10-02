import assert from "node:assert/strict";
import test from "node:test";
import { importMatter, importTemplate } from "../server/import.ts";

function fixture(): any {
  return structuredClone(importTemplate);
}

test("published JSON template imports as an independently derived matter with stable IDs", () => {
  const first = importMatter(JSON.stringify(fixture()), "example.json");
  const second = importMatter(JSON.stringify(fixture()), "another-name.json");
  assert.equal(first.id, second.id);
  assert.equal(first.sourceMode, "import");
  assert.equal(first.clientName, "Jordan Example");
  assert.equal(first.sources.length, 3);
  assert.equal(first.blockers.length, 1);
  assert.equal(first.blockers[0].providerId, "example-pt");
  assert.equal(first.blockers[0].requestedAt, "2026-09-28");
  assert.equal(first.blockers[0].dueAt, "2026-10-05");
  assert.equal(
    first.facts.find((f) => f.label === "Treatment Status")?.value,
    "Ongoing physical therapy; progress notes requested.",
  );
});

test("a second matter uses its own original sources and ignores supplied analytical outputs", () => {
  const input = fixture();
  input.matter = {
    id: "independent-002",
    number: "CASE-002",
    clientName: "Taylor Fiction",
    description: "Unrelated fall matter",
    stage: "Intake",
    status: "Open",
    asOf: "2026-09-05",
  };
  input.providers = [];
  input.sources = [
    {
      id: "field-other",
      type: "field",
      title: "Policy Limits",
      text: "Not provided",
    },
  ];
  input.facts = [
    { id: "invented-fact", value: "UNSUPPORTED CONCLUSION", sourceIds: [] },
  ];
  input.blockers = [
    { id: "invented-blocker", title: "UNSUPPORTED BLOCKER", sourceIds: [] },
  ];
  const matter = importMatter(JSON.stringify(input), "second.json");
  assert.notEqual(matter.id, importMatter(JSON.stringify(fixture())).id);
  assert.equal(matter.clientName, "Taylor Fiction");
  assert.equal(matter.blockers.length, 0);
  assert.equal(matter.sources.length, 1);
  assert.equal(matter.sources[0].locator, "second.json · sources[0]");
  assert.ok(!JSON.stringify(matter).includes("UNSUPPORTED"));
  assert.ok(!JSON.stringify(matter).includes("Jordan"));
  assert.ok(matter.facts.every((f) => f.certainty === "unknown"));
});

test("invalid JSON, missing original records, unsupported record types and empty sources are rejected", () => {
  assert.throws(() => importMatter(""), /non-empty/);
  assert.throws(() => importMatter("{broken"), /syntax/);
  for (const invalid of [
    {},
    { matter: {} },
    { matter: {}, sources: [] },
    { matter: {}, facts: [{ value: "analysis only" }] },
  ]) {
    assert.throws(
      () => importMatter(JSON.stringify(invalid)),
      /matter object.*sources array/,
    );
  }
  for (const source of [
    null,
    { type: "invented-type", text: "Something" },
    { type: "note", text: "" },
    { type: "note", text: "  " },
    { type: "note", text: 123 },
  ]) {
    const input = fixture();
    input.sources = [source];
    assert.throws(
      () => importMatter(JSON.stringify(input)),
      /supported type and original text/,
    );
  }
});

test("matter metadata must be an object, not an array or scalar", () => {
  for (const matter of [[], "not a matter", 42, true]) {
    const input = fixture();
    input.matter = matter;
    assert.throws(() => importMatter(JSON.stringify(input)), /matter object/);
  }
});

test("duplicate source and provider IDs are rejected, including IDs that collide after normalization", () => {
  const duplicateSource = fixture();
  duplicateSource.sources[1].id = duplicateSource.sources[0].id;
  assert.throws(
    () => importMatter(JSON.stringify(duplicateSource)),
    /Duplicate source ID/,
  );
  const duplicateProvider = fixture();
  duplicateProvider.providers.push({
    ...duplicateProvider.providers[0],
    name: "Different provider",
  });
  assert.throws(
    () => importMatter(JSON.stringify(duplicateProvider)),
    /Provider IDs must be unique/,
  );
  const longIds = fixture();
  longIds.sources[0].id = "a".repeat(201);
  longIds.sources[1].id = "a".repeat(200) + "b";
  assert.throws(
    () => importMatter(JSON.stringify(longIds)),
    /Duplicate source ID/,
  );
});

test("unsafe or malformed source URLs are omitted while valid HTTPS evidence URLs survive", () => {
  const input = fixture();
  input.sources = [
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///tmp/private",
    "http://example.test/source",
    "not-a-url",
    "https://example.test/source/42",
  ].map((url, i) => ({
    id: `source-${i}`,
    type: "note",
    title: "Source",
    text: "Original text",
    url,
  }));
  const matter = importMatter(JSON.stringify(input));
  assert.ok(
    matter.sources.slice(0, -1).every((source) => source.url === undefined),
  );
  assert.equal(matter.sources.at(-1)?.url, "https://example.test/source/42");
});

test("impossible dates cannot become snapshot or source dates", () => {
  const invalidSnapshot = fixture();
  invalidSnapshot.matter.asOf = "2026-99-99";
  assert.throws(
    () => importMatter(JSON.stringify(invalidSnapshot)),
    /valid ISO dates/,
  );
  const invalidIncident = fixture();
  invalidIncident.matter.incidentDate = "2026-02-30";
  assert.throws(
    () => importMatter(JSON.stringify(invalidIncident)),
    /valid ISO dates/,
  );
  const invalidSource = fixture();
  invalidSource.sources[0].date = "2026-02-30";
  assert.throws(
    () => importMatter(JSON.stringify(invalidSource)),
    /valid ISO dates/,
  );
});

test("oversized files and record counts are rejected before digestion", () => {
  assert.throws(() => importMatter("x".repeat(6_000_001)), /up to 6 MB/);
  const input = fixture();
  input.sources = Array.from({ length: 10001 }, (_, i) => ({
    id: `${i}`,
    type: "note",
    text: "original",
  }));
  assert.throws(
    () => importMatter(JSON.stringify(input)),
    /10,000 source records/,
  );
});

test("long original sources are rejected instead of silently truncating evidence", () => {
  const input = fixture();
  input.sources = [
    {
      id: "long-note",
      type: "note",
      title: "Long note",
      text: "a".repeat(100001),
    },
  ];
  assert.throws(
    () => importMatter(JSON.stringify(input)),
    /100,000 character limit/,
  );
});
