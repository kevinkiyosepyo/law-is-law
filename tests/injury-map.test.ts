import assert from "node:assert/strict";
import test from "node:test";
import { getInjuryRegions } from "../shared/injury-map.ts";
import type { MatterSnapshot, SourceRecord } from "../shared/types.ts";

const source = (id: string, text: string, type: SourceRecord["type"] = "note", title = "Clinical note"): SourceRecord => ({ id, type, title, text });
const matter = (sources: SourceRecord[], providers: MatterSnapshot["providers"] = []): MatterSnapshot => ({
  id: "test", number: "test", clientName: "Jordan Example", description: "", stage: "Treatment", status: "Open", sourceMode: "import", importedAt: "2026-10-02", asOf: "2026-10-02", sources, providers, facts: [], blockers: [], events: [], warnings: [],
});

test("recorded anatomical injuries are mapped with bilateral areas and precise source pointers", () => {
  const result = getInjuryRegions(matter([
    source("intake", "Injuries claimed: cervical and lumbar spine, both shoulders, both knees."),
    source("imaging", "- Cervical MRI: shallow bulge at C5-6.\n- Both shoulders: bilateral labral tears.\n- Brain MRI: evidence of traumatic brain injury."),
  ]));
  assert.deepEqual(result.map((entry) => entry.id), ["head", "neck", "lower-back", "right-shoulder", "left-shoulder", "right-knee", "left-knee"]);
  assert.deepEqual(result.find((entry) => entry.id === "left-shoulder")?.sourceIds, ["imaging", "intake"]);
  assert.equal(result.find((entry) => entry.id === "left-shoulder")?.summary, "Both shoulders: bilateral labral tears.");
  assert.ok(result.every((entry) => entry.summary.length <= 220));
});

test("sided forearm fractures stay on the stated side and never imply hand, elbow or opposite arm injuries", () => {
  const result = getInjuryRegions(matter([
    source("arm", "Client sustained a right forearm fracture. Right forearm ORIF was performed."),
    source("unsided", "Shoulder pain and wrist pain continue."),
  ]));
  assert.deepEqual(result.map((entry) => entry.id), ["right-forearm"]);
  assert.equal(result[0].summary, "Client sustained a right forearm fracture.");
  assert.deepEqual(result[0].sourceIds, ["arm"]);
});

test("normal scans, denied symptoms, requests, unrelated relatives and historic injuries do not become positive findings", () => {
  const result = getInjuryRegions(matter([
    source("normal", "Brain MRI was normal. CT head and cervical were both negative. No right wrist pain. Left knee fracture was ruled out."),
    source("scan", "A brain MRI was obtained. A left knee appointment is scheduled."),
    source("family", "The client's father sustained a right forearm fracture. His spouse has left shoulder pain."),
    source("prior", "Left ankle fracture in 2011.", "note", "Prior injury discrepancy: left ankle"),
    source("history", "A previous right hip injury is documented."),
    source("request", "Please provide records for the left knee surgery."),
    source("task", "Right shoulder pain and surgery.", "task"),
    source("document", "MRI report: left shoulder tear.pdf", "document"),
    source("contact", "Head and Neck Clinic treats neck injuries.", "contact"),
  ]));
  assert.deepEqual(result, []);
});

test("source headings and known provider names do not produce affected areas", () => {
  const result = getInjuryRegions(matter([
    source("provider", "2026-09-20 — Head injury follow-up\nRight wrist pain was reviewed at Head and Neck Clinic.", "note", "Head injury follow-up"),
  ], [{ id: "clinic", name: "Head and Neck Clinic" }]));
  assert.deepEqual(result.map((entry) => entry.id), ["right-wrist"]);
});

test("current injury fields can supply regions; metadata fields and truncated statements cannot", () => {
  const result = getInjuryRegions(matter([
    source("areas", "Injuries\nLeft ankle and right foot", "field", "Injuries"),
    source("metadata", "Case Description\nRight shoulder pain", "field", "Case Description"),
    source("cutoff", "Case Summary\nHead injury may be [truncated in UI — Show more]", "field", "Case Summary"),
  ]));
  assert.deepEqual(result.map((entry) => entry.id), ["left-ankle", "right-foot"]);
  assert.ok(result.every((entry) => entry.sourceIds[0] === "areas"));
});

test("all central regions and sided joint positions have explicit support", () => {
  const result = getInjuryRegions(matter([
    source("central", "Upper back pain. Chest contusion. Abdominal pain. Pelvic fracture."),
    source("joints", "Left elbow pain. Right wrist sprain. Left hand numbness. Right hip pain. Left knee swelling. Right ankle fracture. Left foot pain."),
  ]));
  assert.deepEqual(result.map((entry) => entry.id), ["upper-back", "chest", "abdomen", "pelvis", "left-elbow", "right-wrist", "left-hand", "right-hip", "left-knee", "right-ankle", "left-foot"]);
});

test("clinical detail wins over newer scheduling notes while negative clauses remain excluded", () => {
  const diagnosis = { ...source("diagnosis", "Right shoulder MRI showed a labral tear."), date: "2025-01-02" };
  const scheduling = { ...source("schedule", "Right shoulder surgery still has no date."), date: "2026-10-01" };
  const result = getInjuryRegions(matter([scheduling, diagnosis, source("mixed", "No head injury, but left knee swelling was reported.")]));
  assert.equal(result.find((entry) => entry.id === "right-shoulder")?.summary, diagnosis.text);
  assert.deepEqual(result.find((entry) => entry.id === "right-shoulder")?.sourceIds, ["diagnosis", "schedule"]);
  assert.ok(result.some((entry) => entry.id === "left-knee"));
  assert.ok(!result.some((entry) => entry.id === "head"));
});

test("a later legal review does not relabel old radiology or monetary summaries as current injuries", () => {
  const snapshot = matter([
    source("old", "The records include left ankle and left foot X-rays dated 5 October 2011, impression an avulsion fracture, and a chest X-ray dated 10 September 2018.", "note", "Preparation for deposition"),
    source("financial", "Specials of $118,400 cover the left shoulder arthroscopy and TBI findings."),
    source("provider", "Head and Neck Clinic reviewed right wrist pain."),
  ]);
  snapshot.incidentDate = "2023-04-23";
  assert.deepEqual(getInjuryRegions(snapshot).map((entry) => entry.id), ["right-wrist"]);
});

test("dated findings stay between the incident and the matter snapshot", () => {
  const snapshot = matter([
    { ...source("before", "Left wrist fracture."), date: "2023-04-22" },
    { ...source("incident", "Right forearm fracture."), date: "2023-04-23" },
    { ...source("current", "Neck pain."), date: "2026-10-02" },
    { ...source("future", "Left knee swelling."), date: "2026-10-03" },
  ]);
  snapshot.incidentDate = "2023-04-23";
  assert.deepEqual(getInjuryRegions(snapshot).map((entry) => entry.id), ["neck", "right-forearm"]);
});
