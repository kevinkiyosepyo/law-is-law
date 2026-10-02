import assert from "node:assert/strict";
import test from "node:test";
import { shortSummary } from "../shared/short-summary.ts";
import type { SourceRecord } from "../shared/types.ts";

const source = (
  id: string,
  type: SourceRecord["type"],
  title: string,
  text: string,
): SourceRecord => ({ id, type, title, text });

test("short version combines recorded accident with claimed injuries and retains sources", () => {
  const result = shortSummary([
    source(
      "summary",
      "field",
      "Case Summary",
      "Case Summary\n  Client reports a bicycle collision on River Road. Wrist pain [truncated in UI — Show more]",
    ),
    source(
      "intake",
      "note",
      "Intake summary",
      "Injuries claimed: left wrist and right knee. Treatment has started.",
    ),
  ]);
  assert.equal(result.length, 2);
  assert.match(
    result[0].text,
    /Client reports a bicycle collision on River Road/,
  );
  assert.match(result[1].text, /left wrist and right knee/);
  assert.deepEqual(
    result.map((line) => line.sourceIds),
    [["summary"], ["intake"]],
  );
  assert.doesNotMatch(JSON.stringify(result), /truncated|Treatment has/);
});

test("missing records produce explicit unknowns instead of case-specific conclusions", () => {
  const result = shortSummary([]);
  assert.equal(result.length, 2);
  assert.ok(result.every((line) => line.sourceIds.length === 0));
  assert.match(result[0].text, /not available/);
  assert.match(result[1].text, /not specified/);
});

test("long summary stays within three sentences without importing unrelated details", () => {
  const result = shortSummary([
    source(
      "s",
      "field",
      "Case Summary",
      "Case Summary\nClient reports a fall in a shop. Left arm pain was reported. Treatment is ongoing. Employment records are missing.",
    ),
  ]);
  const count = [
    ...new Intl.Segmenter("en", { granularity: "sentence" }).segment(
      result.map((line) => line.text).join(" "),
    ),
  ].length;
  assert.ok(count <= 3);
  assert.doesNotMatch(JSON.stringify(result), /Employment records/);
});

test("truncated accident clauses are not presented as complete facts", () => {
  const result = shortSummary([
    source(
      "s",
      "field",
      "Case Summary",
      "Case Summary\nClient may have [truncated in UI — Show more]",
    ),
  ]);
  assert.match(result[0].text, /not available/);
});

test("intake fallback preserves the client attribution and explains body-area terminology", () => {
  const result = shortSummary([
    source(
      "intake",
      "note",
      "Intake summary",
      "Mechanism as he tells it: he fell on the stairs. Injuries claimed: cervical and lumbar spine, both knees.",
    ),
  ]);
  assert.equal(
    result[0].text,
    "The client reported that he fell on the stairs.",
  );
  assert.equal(
    result[1].text,
    "Reported injuries involve the neck and lower back, both knees.",
  );
});
