import type { MatterSnapshot, SourceRecord } from "./types";

type Limb = "shoulder" | "arm" | "forearm" | "elbow" | "wrist" | "hand" | "hip" | "knee" | "ankle" | "foot";
export type InjuryRegionId =
  | "head" | "neck" | "upper-back" | "lower-back" | "chest" | "abdomen" | "pelvis"
  | `${"right" | "left"}-${Limb}`;

export interface InjuryRegion {
  id: InjuryRegionId;
  label: string;
  /** A shortened quotation of the source, retaining its qualifications. */
  summary: string;
  sourceIds: string[];
}

const centralRegions: { id: InjuryRegionId; label: string; pattern: RegExp }[] = [
  { id: "head", label: "Head", pattern: /\b(?:head|brain|concussion|TBI|traumatic brain injury)\b/i },
  { id: "neck", label: "Neck", pattern: /\b(?:neck|cervical)\b/i },
  { id: "upper-back", label: "Upper back", pattern: /\b(?:upper[ -]back|thoracic)\b/i },
  { id: "lower-back", label: "Lower back", pattern: /\b(?:lower[ -]back|low[ -]back|lumbar|lumbosacral)\b/i },
  { id: "chest", label: "Chest", pattern: /\b(?:chest|ribs?|sternum)\b/i },
  { id: "abdomen", label: "Abdomen", pattern: /\b(?:abdomen|abdominal)\b/i },
  { id: "pelvis", label: "Pelvis", pattern: /\b(?:pelvis|pelvic|sacrum|coccyx|tailbone)\b/i },
];
const limbPatterns: [Limb, string][] = [
  ["shoulder", "shoulders?"],
  ["arm", "(?:upper[ -]arms?|arms?)"],
  ["forearm", "(?:forearms?|radius|ulna)"],
  ["elbow", "elbows?"],
  ["wrist", "wrists?"],
  ["hand", "(?:hands?|fingers?|thumbs?)"],
  ["hip", "hips?"],
  ["knee", "knees?"],
  ["ankle", "ankles?"],
  ["foot", "(?:feet|foot|toes?)"],
];

const compact = (text: string) => text.replace(/\s+/g, " ").trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const finding = /\b(?:pain|painful|fractur\w*|broken|break|torn|tears?|ruptur\w*|sprain\w*|strain\w*|contusion\w*|bruisi\w*|swelling|swollen|oedema|edema|numbness|tingling|weakness|tenderness|bulg\w*|herniat\w*|concussion|TBI|traumatic brain injury|laceration\w*|dislocat\w*|impingement|abnormal|limited (?:motion|rotation)|reduced (?:motion|grip)|restricted (?:motion|rotation))\b/i;
const treatment = /\b(?:arthroscopy|repair|ORIF|fixation|surgery|surgical|operative|operated|treated|treating|treatment|rehabilitation|physical therapy)\b/i;
const injuryStatement = /\b(?:injur(?:y|ies|ed)|diagnos(?:is|ed)|complain(?:s|ed|ts)|reports? (?:pain|symptoms))\b/i;
const negated = /\b(?:negative|normal|unremarkable|asymptomatic|denies|denied|ruled out|rule out|without (?:any )?(?:pain|injur\w*|fracture|abnormal\w*))\b|\bno\s+(?:\w+\s+){0,3}(?:pain|injur\w*|fracture|tear|symptoms?|abnormal\w*|evidence)\b/i;
const otherPerson = /\b(?:mother|father|sister|brother|daughter|son|wife|husband|spouse|partner|child|children|family member|passenger|other driver|defendant|witness)\b/i;
const administrative = /\b(?:please (?:provide|send|confirm|obtain)|request(?:ing|ed)? (?:a |an |the |updated )?(?:record|report|date|note)|obtain (?:a |the |updated )?(?:record|report|note)|records? (?:requested|missing|outstanding)|file(?:d)? (?:name|to)|\.pdf\b|inventory|metadata only)\b/i;
const financial = /\$\d|\b(?:wage loss|lien|valuation|settlement|damages assessment|policy limit|demand package)\b/i;

function bodyText(source: SourceRecord): string {
  const lines = source.text.trim().split(/\r?\n/);
  // Text exports include note headings or communication participants on line one.
  if (lines.length > 1 && (/^\s*\d{4}-\d{2}-\d{2}\b/.test(lines[0]) || compact(lines[0]).replace(/:$/, "").toLowerCase() === source.title.toLowerCase())) {
    lines.shift();
  }
  if (source.type === "field") {
    lines[0] = (lines[0] || "").replace(new RegExp(`^${escape(source.title)}\\s*:\\s*`, "i"), "");
  }
  // In communication exports, the subject before the dash is metadata.
  if (source.type === "communication") lines[0] = (lines[0] || "").replace(/^.*?\s+[—–]\s+/, "");
  return lines.join("\n");
}

function excerpts(source: SourceRecord): string[] {
  const segments: string[] = [];
  const text = bodyText(source);
  for (const paragraph of text.split(/\n\s*(?:[-•]\s+|\n)/)) {
    const cleaned = compact(paragraph);
    for (const { segment } of new Intl.Segmenter("en", { granularity: "sentence" }).segment(cleaned)) {
      // Keep separate positive and negative clauses from contaminating one another.
      segments.push(...segment.split(/;|\b(?:but|however|while)\b/i).map(compact).filter(Boolean));
    }
  }
  return segments;
}

function regionIds(text: string): { id: InjuryRegionId; label: string }[] {
  const found = centralRegions.filter(({ pattern }) => pattern.test(text));
  const result: { id: InjuryRegionId; label: string }[] = found.map(({ id, label }) => ({ id, label }));
  for (const [limb, pattern] of limbPatterns) {
    const bilateral = new RegExp(`\\b(?:both|bilateral(?:ly)?|right and left|left and right)\\s+(?:upper\\s+)?${pattern}\\b`, "i").test(text);
    for (const side of ["right", "left"] as const) {
      // Side must be explicitly attached to the region; no nearest-side inference.
      const sided = new RegExp(`\\b${side}\\s+(?:dominant\\s+)?${pattern}\\b|\\b${pattern}\\s*\\(${side}\\)`, "i").test(text);
      if (bilateral || sided) result.push({ id: `${side}-${limb}`, label: `${side[0].toUpperCase()}${side.slice(1)} ${limb}` });
    }
  }
  return result;
}

function brief(text: string): string {
  if (text.length <= 220) return text;
  return `${text.slice(0, 217).replace(/\s+\S*$/, "").replace(/[,:;]$/, "")}…`;
}

/**
 * Conservative source-text extraction, not a diagnosis or a completeness claim.
 * Missing/unsided regions stay unmarked. Tasks, contacts and document inventories
 * never establish an injury. The excerpt retains the source's recorded wording.
 */
export function getInjuryRegions(matter: MatterSnapshot): InjuryRegion[] {
  const matches = new Map<InjuryRegionId, InjuryRegion & { score: number; date: string }>();
  for (const source of matter.sources) {
    if (!["note", "communication", "field"].includes(source.type)) continue;
    const sourceDay = source.date?.slice(0, 10);
    if (sourceDay && (sourceDay > matter.asOf.slice(0, 10) || (matter.incidentDate && sourceDay < matter.incidentDate.slice(0, 10)))) continue;
    if (/\b(?:prior injur\w*|past medical|family history|prior medical|medical history)\b/i.test(source.title)) continue;
    const injuryField = source.type === "field" && /^(?:(?:reported|claimed|documented|current) )?injur(?:y|ies)(?: summary| description| areas)?$/i.test(source.title);
    if (source.type === "field" && !injuryField && !/^(?:case summary|treatment status|diagnosis|diagnoses)$/i.test(source.title)) continue;
    for (const excerpt of excerpts(source)) {
      if (/\[.*(?:truncat|show more)/i.test(excerpt) || negated.test(excerpt) || otherPerson.test(excerpt) || administrative.test(excerpt) || financial.test(excerpt)) continue;
      if (/\b(?:prior|pre-existing|previous|remote|historic)\s+(?:\w+\s+){0,3}(?:injur\w*|fractur\w*|pain|surgery)\b/i.test(excerpt)) continue;
      // A later review can quote old imaging. Its note date does not make the
      // historical injury part of the current incident.
      const incidentYear = Number(matter.incidentDate?.slice(0, 4));
      if (incidentYear && /\b(?:dated|from|in|history)\b/i.test(excerpt) && [...excerpt.matchAll(/\b(?:19|20)\d{2}\b/g)].some(([year]) => Number(year) < incidentYear)) continue;
      // Provider names in a clinical sentence must not create anatomical matches.
      let searchable = excerpt;
      for (const provider of matter.providers) {
        if (provider.name) searchable = searchable.replace(new RegExp(escape(provider.name), "gi"), "[provider]");
      }
      searchable = searchable.replace(/\b[A-Z][\w'-]*(?:[ ,&-]+(?:[A-Z][\w'-]*|and|of|the)){0,7}[ ,&-]+(?:Clinic|Center|Hospital|Services|Institute|LLC|PLLC)\b/g, "[provider]");
      const hasFinding = finding.test(searchable);
      const hasTreatment = treatment.test(searchable);
      if (!hasFinding && !hasTreatment && !injuryStatement.test(searchable) && !injuryField) continue;
      // A scan or an appointment by itself is not an affirmative clinical finding.
      if (/\b(?:MRI|CT|x[ -]?ray|imaging|scan)\b/i.test(searchable) && !hasFinding && !hasTreatment && !injuryStatement.test(searchable)) continue;
      const score = (hasFinding ? 3 : hasTreatment ? 2 : 1)
        + (hasFinding && /\b(?:MRI|imaging|operative|clinical)\b/i.test(`${source.title} ${searchable}`) ? 1 : 0)
        - (/\b(?:case evaluation|valuation|deposition|demand|settlement|negotiation)\b/i.test(source.title) ? 1 : 0);
      for (const { id, label } of regionIds(searchable)) {
        const existing = matches.get(id);
        const date = source.date || "";
        if (!existing) matches.set(id, { id, label, summary: brief(excerpt), sourceIds: [source.id], score, date });
        else {
          if (!existing.sourceIds.includes(source.id)) existing.sourceIds.push(source.id);
          if (score > existing.score || (score === existing.score && date > existing.date)) {
            existing.summary = brief(excerpt);
            existing.score = score;
            existing.date = date;
            // The displayed excerpt's source is always first.
            existing.sourceIds = [source.id, ...existing.sourceIds.filter((value) => value !== source.id)];
          }
        }
      }
    }
  }
  const order = [...centralRegions.map(({ id }) => id), ...limbPatterns.flatMap(([limb]) => [`right-${limb}`, `left-${limb}`])];
  return [...matches.values()]
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    .map(({ score: _score, date: _date, ...region }) => region);
}
