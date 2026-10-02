import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseTextExport } from "../server/digest.ts";
import { buildAccidentViewModel, parseAccidentDate } from "../src/accident/accidentViewModel.ts";

const example = () => parseTextExport(readFileSync(new URL("../fixtures/example-case.txt", import.meta.url), "utf8"));

test("displayed narrative replaces long dashes without changing source evidence", () => {
  const matter = example();
  matter.clientName = "Morgan Example - Demo";
  const text = "Case Summary\nMorgan Example — a three-vehicle collision.";
  matter.sources.push({id:"summary", type:"field", title:"Case Summary", text});
  const result = buildAccidentViewModel(matter);
  assert.equal(result.narrative, "Morgan Example: a three-vehicle collision.");
  assert.equal(result.descriptionSource?.text, text);
});

test("accident dates reject impossible dates and accept US and ISO records", () => {
  assert.equal(parseAccidentDate("2026-02-30"), null);
  assert.equal(parseAccidentDate("Unknown"), null);
  assert.equal(parseAccidentDate("04/23/2023")?.toISOString(), "2023-04-23T12:00:00.000Z");
});

test("accident chronology respects the incident and snapshot bounds", () => {
  const matter = example();
  matter.events.push({id:"future", title:"Not yet happened", date:"2099-01-01", category:"calendar", sourceIds:[]});
  const result = buildAccidentViewModel(matter);
  assert.ok(result.chronology.every(event => event.id !== "future"));
  assert.ok(result.chronology.length <= 5);
  assert.equal(result.location, undefined);
  assert.equal(result.incidentTime, undefined);
  assert.equal(result.elapsedDays, 51);
});

test("recorded narrative keeps its own source and a future incident has unknown age", () => {
  const matter = example();
  matter.sources.push({id:"summary", type:"field", title:"Case Summary", text:"Case Summary\nA bicycle collision on River Road."});
  matter.incidentDate = "2099-01-01";
  const result = buildAccidentViewModel(matter);
  assert.equal(result.narrative, "A bicycle collision on River Road.");
  assert.equal(result.descriptionSource?.id, "summary");
  assert.equal(result.elapsedDays, null);
});
