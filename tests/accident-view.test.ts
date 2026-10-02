import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildAccidentViewModel } from "../src/components/accidentViewModel.ts";
import { parseTextExport } from "../server/digest.ts";

const example = readFileSync(
  fileURLToPath(new URL("../fixtures/example-case.txt", import.meta.url)),
  "utf8",
);

test("accident view model stays source-backed and exposes missing context", () => {
  const matter = parseTextExport(example);
  const accident = buildAccidentViewModel(matter);

  assert.equal(accident.incidentDate, "2026-08-12");
  assert.equal(accident.narrative, "bicycle collision");
  assert.equal(accident.location, undefined);
  assert.equal(accident.elapsedDays, 51);
  assert.ok(accident.dateSource);
  assert.ok(accident.descriptionSource);
  assert.ok(accident.openQuestions.includes("Where exactly did the accident happen?"));
  assert.ok(accident.openQuestions.includes("What time did the accident happen?"));
  assert.equal(accident.chronology[0].isIncident, true);
  assert.ok(!accident.chronology.some((event) => event.date > matter.asOf));
});

test("accident date falls back to a source-linked matter fact", () => {
  const matter = parseTextExport(example);
  const dateFact = matter.facts.find((fact) =>
    /date of incident/i.test(fact.label),
  )!;
  const withoutTopLevelDate = { ...matter, incidentDate: undefined };
  const accident = buildAccidentViewModel(withoutTopLevelDate);

  assert.equal(accident.incidentDate, dateFact.value);
  assert.equal(accident.dateSource?.id, dateFact.sourceIds[0]);
});
