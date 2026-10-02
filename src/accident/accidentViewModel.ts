import type {
  Fact,
  MatterSnapshot,
  SourceRecord,
  TimelineEvent,
} from "../../shared/types";

export interface AccidentChronologyItem extends TimelineEvent {
  source?: SourceRecord;
  isIncident?: boolean;
}

export interface AccidentViewModel {
  incidentDate?: string;
  dateSource?: SourceRecord;
  descriptionSource?: SourceRecord;
  locationSource?: SourceRecord;
  timeSource?: SourceRecord;
  narrative: string;
  location?: string;
  incidentTime?: string;
  elapsedDays: number | null;
  openQuestions: string[];
  relatedEvidence: SourceRecord[];
  chronology: AccidentChronologyItem[];
}

export const parseAccidentDate = (value?: string) => {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !us) return null;
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(us![3]), Number(us![1]), Number(us![2])];
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? parsed : null;
};

export const accidentSourceValue = (source?: SourceRecord) => {
  if (!source) return undefined;
  const text = source.text.trim();
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1 && lines[0].toLowerCase() === source.title.toLowerCase())
    return lines.slice(1).join(" ");
  const colon = text.indexOf(":");
  if (
    colon > -1 &&
    text.slice(0, colon).trim().toLowerCase() === source.title.toLowerCase()
  )
    return text.slice(colon + 1).trim();
  return text;
};

const cleanDescription = (description: string, clientName: string) => {
  const escapedName = clientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withoutClient = description.replace(
    new RegExp(`^${escapedName}\\s*(?:—|–|-|:)\\s*`, "i"),
    "",
  );
  return (withoutClient.trim() || description).replace(/\s*—\s*/g, ": ");
};

const factSource = (matter: MatterSnapshot, fact?: Fact) =>
  fact?.sourceIds
    .map((id) => matter.sources.find((source) => source.id === id))
    .find((source): source is SourceRecord => !!source);

export function buildAccidentViewModel(
  matter: MatterSnapshot,
): AccidentViewModel {
  const findFieldSource = (pattern: RegExp) =>
    matter.sources.find(
      (source) => source.type === "field" && pattern.test(source.title),
    );
  const findFact = (pattern: RegExp) =>
    matter.facts.find((fact) => pattern.test(fact.label));

  const dateFact = findFact(/date of incident|incident date|accident date/i);
  const locationFact = findFact(
    /accident location|incident location|collision location|location of/i,
  );
  const timeFact = findFact(
    /time of (?:the )?(?:incident|accident)|accident time|incident time/i,
  );
  const dateSource =
    factSource(matter, dateFact) ||
    findFieldSource(/date of incident|incident date|accident date/i);
  const descriptionSource =
    findFieldSource(/^case summary$/i) ||
    findFieldSource(
      /^case summary$|^description$|incident description|accident description|collision details/i,
    );
  const locationSource =
    factSource(matter, locationFact) ||
    findFieldSource(
      /accident location|incident location|collision location|location of/i,
    );
  const timeSource =
    factSource(matter, timeFact) ||
    findFieldSource(
      /time of (?:the )?(?:incident|accident)|accident time|incident time/i,
    );

  const factIncidentDate = dateFact?.value || accidentSourceValue(dateSource);
  const incidentDate =
    (parseAccidentDate(matter.incidentDate) && matter.incidentDate) ||
    (parseAccidentDate(factIncidentDate) && factIncidentDate) ||
    undefined;
  const narrative = cleanDescription(accidentSourceValue(descriptionSource) || matter.description, matter.clientName);
  const location = locationFact?.value || accidentSourceValue(locationSource);
  const incidentTime = timeFact?.value || accidentSourceValue(timeSource);
  const parsedIncidentDate = parseAccidentDate(incidentDate);
  const snapshotDate = parseAccidentDate(matter.asOf);
  const elapsedDays =
    parsedIncidentDate && snapshotDate && snapshotDate >= parsedIncidentDate
      ? Math.floor(
            (snapshotDate.getTime() - parsedIncidentDate.getTime()) / 86_400_000,
          )
      : null;

  const reportSource = matter.sources.find((source) =>
    /police report|incident report|crash report|collision report/i.test(
      `${source.title} ${source.text}`,
    ),
  );
  const openQuestions = [
    ...(!location ? ["Where exactly did the accident happen?"] : []),
    ...(!incidentTime ? ["What time did the accident happen?"] : []),
    ...(narrative.split(/\s+/).length < 8
      ? ["What sequence of events led to the impact?"]
      : []),
    ...(!reportSource ? ["Was a police or incident report created?"] : []),
  ];

  const evidenceIds = new Set(
    [dateFact, locationFact, timeFact]
      .flatMap((fact) => fact?.sourceIds || [])
      .filter(Boolean),
  );
  const relatedEvidence = matter.sources
    .filter(
      (source) =>
        evidenceIds.has(source.id) ||
        /accident|incident|collision|crash|police|^description$|date of incident|matter overview/i.test(
          `${source.title} ${source.text}`,
        ),
    )
    .filter(
      (source, index, sources) =>
        sources.findIndex((candidate) => candidate.id === source.id) === index,
    )
    .slice(0, 4);

  const datedEvents = matter.events
    .filter((event) => {
      const eventDate = parseAccidentDate(event.date);
      if (!eventDate) return false;
      if (parsedIncidentDate && eventDate < parsedIncidentDate) return false;
      if (snapshotDate && eventDate > snapshotDate) return false;
      return true;
    })
    .sort(
      (a, b) =>
        (parseAccidentDate(a.date)?.getTime() || 0) -
        (parseAccidentDate(b.date)?.getTime() || 0),
    )
    .slice(0, 4);
  const chronology: AccidentChronologyItem[] = [
    ...(incidentDate
      ? [
          {
            id: "incident-origin",
            title: "Recorded incident date",
            date: incidentDate,
            category: "Incident",
            sourceIds: dateSource ? [dateSource.id] : [],
            source: dateSource,
            isIncident: true,
          },
        ]
      : []),
    ...datedEvents.map((event) => ({
      ...event,
      source: matter.sources.find((source) =>
        event.sourceIds.includes(source.id),
      ),
    })),
  ].slice(0, 5);

  return {
    incidentDate,
    dateSource,
    descriptionSource,
    locationSource,
    timeSource,
    narrative,
    location,
    incidentTime,
    elapsedDays,
    openQuestions,
    relatedEvidence,
    chronology,
  };
}
