import type { MatterSnapshot } from "./types";

export const chartKinds = {
  record: "Medical records",
  message: "Messages",
  appointment: "Appointments",
  billing: "Billing",
  notification: "Notifications",
} as const;
export type ChartKind = keyof typeof chartKinds;
export interface ChartRecord {
  id: string;
  kind: ChartKind;
  title: string;
  provider: string;
  date: string;
  summary: string;
  body: string;
  nextStep?: string;
  origin: "fictional" | "case-excerpt" | "pasted";
  sourceId?: string;
}
export interface ChartSession {
  connected: boolean;
  records: ChartRecord[];
  sharedIds: string[];
}
export const emptyChartSession: ChartSession = { connected: false, records: [], sharedIds: [] };

/** Authored walkthrough content, never a claim that these providers use MyChart. */
export function getChartDemoRecords(matter: MatterSnapshot): ChartRecord[] {
  if (matter.sourceMode !== "sample") return [];
  const notification: ChartRecord = {
    id: `${matter.id}:chart:notification`, kind: "notification",
    title: "A portal notification is not the medical record",
    provider: "Fictional patient portal", date: matter.asOf.slice(0, 10),
    summary: "Example email: “New information is available in your patient portal.”",
    body: "This fictional email only announces that information is available. It contains no clinical report, message body, diagnosis, attachment, or coverage decision. An email connection alone would not supply the underlying medical record.",
    nextStep: "Obtain the actual portal message or record before adding it to an attorney review packet.",
    origin: "fictional",
  };
  if (matter.id !== "sample-demo-kevin-003") {
    const treatment = matter.facts.find((fact) => fact.category === "treatment" && fact.certainty === "recorded");
    return treatment ? [{
      id: `${matter.id}:chart:treatment`, kind: "record", title: "Treatment status · case excerpt",
      provider: "Existing sample case", date: matter.asOf.slice(0, 10),
      summary: treatment.value, body: treatment.value, origin: "case-excerpt",
      sourceId: treatment.sourceIds[0],
      nextStep: "This is an existing case excerpt, not a retrieved portal record. Request the original clinical note when needed.",
    }, notification] : [notification];
  }
  const definitions: (Omit<ChartRecord, "id" | "origin" | "sourceId"> & { key: string; sourceTitle: string })[] = [
    {
      key: "follow-up", kind: "appointment", title: "Follow-up visit · confirmation needed",
      provider: "Aldercrest Orthopedics", date: "2026-10-01",
      summary: "October 12, 10:00–10:30 a.m. · tentative examination, not surgery.",
      body: "Fictional appointment preview\n\nA follow-up examination is tentatively held for October 12, 2026, from 10:00 to 10:30 a.m. The time remains subject to Kevin’s confirmation. No time zone is supplied in the case record; confirm it with the provider.\n\nThis is an examination to discuss the next treatment step. It is not a booked revision operation.",
      nextStep: "Patient: confirm the appointment with the provider. Attorney: keep future surgery listed as unresolved.",
      sourceTitle: "Specialist follow-up tentatively held",
    },
    {
      key: "surgery-message", kind: "message", title: "Your treatment plan is still under review",
      provider: "Aldercrest Orthopedics", date: "2026-10-01",
      summary: "The latest images are being reviewed. No revision procedure or surgery date is confirmed.",
      body: "Fictional portal message, adapted from the sample case\n\nThe physician is reviewing the latest image comparison. No revision procedure date has been set, and no treatment choice is recorded. The office expects a completed assessment after the follow-up examination.\n\nThe February fixation already occurred. The open question concerns future care, not whether the original surgery happened.",
      nextStep: "Obtain the completed assessment after the follow-up; do not describe a possible procedure as scheduled.",
      sourceTitle: "Partial surgery update; no date chosen",
    },
    {
      key: "hospital-bill", kind: "billing", title: "Hospital account · itemized statement",
      provider: "Sable Harbor Emergency Hospital", date: "2026-09-24",
      summary: "$32,900 charged · $25,000 paid · $6,000 adjusted · $1,900 statement balance.",
      body: "Fictional statement preview\n\nRecorded charges: $32,900\nRecorded payments: $25,000\nRecorded adjustments: $6,000\nStatement balance: $1,900\n\nOne benefit transaction was reversed and reposted under a corrected reference without changing the total. The reversal and replacement should be reviewed together.\n\nThis is the hospital account only, not the total case balance. A statement balance alone does not establish final patient responsibility.",
      nextStep: "Review the original itemization and corrected transaction before updating the case ledger.",
      sourceTitle: "Itemized ledger attached",
    },
    {
      key: "imaging", kind: "record", title: "September imaging · report summary",
      provider: "Brindle Imaging", date: "2026-09-16",
      summary: "Healing changes described; comparison with prior images remains part of the specialist’s review.",
      body: "Fictional clinical summary, not an original radiology report\n\nThe sample narrative describes interval healing changes around the fixation and an area the specialist wants to compare with prior studies.\n\nIt does not establish a failed operation or a recommendation for revision surgery. Report text and an image index are in the case file; the export identifiers still need verification.",
      nextStep: "Verify report identifiers and obtain the treating specialist’s interpretation of the comparison.",
      sourceTitle: "September imaging excerpt",
    },
    {
      key: "discharge", kind: "record", title: "February surgery & discharge · summary",
      provider: "Sable Harbor Emergency Hospital", date: "2026-02-19",
      summary: "February 12 fixation and February 14 discharge, described in the February 19 case excerpt.",
      body: "Fictional visit summary, adapted from the sample case\n\nThe February 12 operative account describes fixation of the right radius and ulna with plates and screws. The February 14 discharge account records a protective splint, planned review, and activity limitations from the treating team.\n\nThe excerpt reports no intraoperative complication. It does not establish complete future recovery or replace the original operative and discharge records. The date shown on this card is the case excerpt date.",
      sourceTitle: "Operative and discharge excerpt",
    },
  ];
  return [notification, ...definitions.map(({ key, sourceTitle, ...record }) => ({
    ...record, id: `${matter.id}:chart:${key}`, origin: "fictional" as const,
    sourceId: matter.sources.find((source) => source.title.startsWith(sourceTitle))?.id,
  }))];
}

export function connectChartDemo(session: ChartSession, matter: MatterSnapshot): ChartSession {
  if (matter.sourceMode !== "sample") return session;
  const existing = new Set(session.records.map((record) => record.id));
  return { ...session, connected: true, records: [...session.records, ...getChartDemoRecords(matter).filter((record) => !existing.has(record.id))] };
}

/** Preview membership only; this function grants no real access or consent. */
export function previewChartSharing(session: ChartSession, ids: string[], reviewed: boolean): ChartSession {
  if (!reviewed) return session;
  const eligible = new Set(session.records.filter((record) => record.kind !== "notification").map((record) => record.id));
  return { ...session, sharedIds: [...new Set([...session.sharedIds, ...ids.filter((id) => eligible.has(id))])] };
}

export function filterChartRecords(records: ChartRecord[], kind: ChartKind | "all", query: string): ChartRecord[] {
  const term = query.trim().toLocaleLowerCase();
  return records.filter((record) => (kind === "all" || record.kind === kind)
    && (!term || `${record.title} ${record.provider} ${record.summary} ${record.body}`.toLocaleLowerCase().includes(term)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

export interface ChartDraft { title: string; provider: string; date: string; kind: string; body: string }
export function validateChartDraft(draft: ChartDraft): string | null {
  if (!draft.title.trim() || !draft.provider.trim() || !draft.body.trim()) return "Add a title, provider, and record text.";
  if (draft.title.trim().length > 180 || draft.provider.trim().length > 180 || draft.body.trim().length > 20000) return "Use up to 180 characters for the title and provider, and 20,000 for the record text.";
  if (!Object.hasOwn(chartKinds, draft.kind)) return "Choose a supported record type.";
  const parsed = new Date(`${draft.date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== draft.date) return "Enter a valid record date.";
  return null;
}
