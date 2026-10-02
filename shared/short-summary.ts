import type { SourceRecord } from "./types";

export interface SummaryLine {
  text: string;
  sourceIds: string[];
}

const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const sentences = (value: string) =>
  [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(value)]
    .map((part) => part.segment.trim())
    .filter(Boolean);

/** Extract recorded wording, not fault determinations or generated case facts. */
export function shortSummary(sources: SourceRecord[]): SummaryLine[] {
  const summary = sources.find(
    (source) => source.type === "field" && /^case summary$/i.test(source.title),
  );
  const intake = sources.find(
    (source) => source.type === "note" && /intake summary/i.test(source.title),
  );
  const lines: SummaryLine[] = [];
  if (summary) {
    const raw = compact(
      summary.text.replace(/^\s*Case Summary\s*[:\n]\s*/i, ""),
    );
    const truncated = /\[truncated|\[.*show more/i.test(raw);
    const clean = raw.split(/\[truncated|\[.*show more/i)[0].trim();
    const complete = sentences(clean).filter(
      (sentence) => !truncated || /[.!?]$/.test(sentence),
    );
    for (const sentence of complete.slice(0, intake ? 1 : 2)) {
      lines.push({
        text: `The case summary reports: ${sentence}`,
        sourceIds: [summary.id],
      });
    }
  }
  if (!lines.length && intake) {
    const text = compact(intake.text);
    const incident = text.match(/Mechanism as he tells it:\s*(.+)/i)?.[1];
    if (incident) {
      lines.push({
        text: `The client reported that ${sentences(incident)[0]}`,
        sourceIds: [intake.id],
      });
    }
  }
  if (!lines.length) {
    lines.push({
      text: "A short account of the accident is not available in the imported records.",
      sourceIds: [],
    });
  }
  const injuries =
    intake &&
    compact(intake.text).match(
      /(?:Injuries claimed|Claimed injuries):\s*([^.!?]+)[.!?]/i,
    )?.[1];
  if (injuries) {
    const plain = injuries.replace(
      /cervical and lumbar spine/gi,
      "neck and lower back",
    );
    lines.push({
      text: `Reported injuries involve the ${plain}.`,
      sourceIds: [intake!.id],
    });
  } else if (lines.length < 2) {
    lines.push({
      text: "The affected body areas are not specified in the available case summary or intake.",
      sourceIds: [],
    });
  }
  return lines.slice(0, 3);
}
