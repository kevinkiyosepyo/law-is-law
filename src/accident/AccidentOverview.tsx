import "./accident.css";
import {
  ArrowRight,
  CalendarDays,
  Car,
  Clock3,
  FileSearch,
  MapPin,
  Route,
} from "lucide-react";
import type {
  MatterSnapshot,
  SourceRecord,
} from "../../shared/types";
import {
  accidentSourceValue,
  buildAccidentViewModel,
  parseAccidentDate,
} from "./accidentViewModel";

interface AccidentOverviewProps {
  matter: MatterSnapshot;
  onOpenSource: (source: SourceRecord) => void;
}

interface AccidentDetail {
  label: string;
  value: string;
  note: string;
  missing?: boolean;
  icon: typeof CalendarDays;
  source?: SourceRecord;
}

const formatDate = (value?: string, long = false) => {
  const parsed = parseAccidentDate(value);
  if (!parsed) return "Not recorded";
  return parsed.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: long ? "long" : "short",
    day: "numeric",
    year: "numeric",
    ...(long ? { weekday: "long" } : {}),
  });
};

function AccidentOverview({ matter, onOpenSource }: AccidentOverviewProps) {
  const {
    incidentDate,
    dateSource,
    descriptionSource,
    locationSource,
    timeSource,
    narrative,
    location,
    incidentTime,
    elapsedDays,
    relatedEvidence,
    chronology,
  } = buildAccidentViewModel(matter);

  const details: AccidentDetail[] = [
    {
      label: "When",
      value: formatDate(incidentDate, true),
      note: incidentTime ? `Recorded time: ${incidentTime}` : "Time not recorded",
      missing: !incidentDate,
      icon: CalendarDays,
      source: dateSource,
    },
    {
      label: "Where",
      value: location || "Not recorded",
      note: location ? "From imported matter records" : "Location needs confirmation",
      missing: !location,
      icon: MapPin,
      source: locationSource,
    },
    {
      label: "Recorded incident",
      value: narrative || "Not recorded",
      note: descriptionSource ? "From the linked record" : "Imported matter description",
      missing: !narrative,
      icon: Car,
      source: descriptionSource,
    },
    {
      label: "Days since incident",
      value: elapsedDays === null ? "Not available" : `${elapsedDays} days`,
      note: `As of ${formatDate(matter.asOf)}`,
      missing: elapsedDays === null,
      icon: Clock3,
      source: dateSource,
    },
  ];

  const narrativeSource = descriptionSource;

  return (
    <div className="accident-dashboard">
      <section className="accident-hero">
        <div className="accident-hero-icon" aria-hidden="true">
          <Car size={27} />
        </div>
        <div className="accident-hero-copy">
          <span className="accident-kicker">INCIDENT BRIEF</span>
          <h2>{narrative || "Accident details"}</h2>
          <p>
            {matter.clientName} · Matter {matter.number}
          </p>
        </div>
        <div className="accident-hero-date">
          <CalendarDays size={17} />
          <span>Incident date</span>
          <strong>{formatDate(incidentDate)}</strong>
        </div>
      </section>

      <section className="accident-detail-grid" aria-label="Accident facts">
        {details.map((detail) => {
          const Icon = detail.icon;
          return (
            <article
              className={`accident-detail-card ${detail.missing ? "missing" : ""}`}
              key={detail.label}
            >
              <span className="accident-detail-icon">
                <Icon size={18} />
              </span>
              <div>
                <span>{detail.label}</span>
                <strong>{detail.value}</strong>
                <small>{detail.note}</small>
                {detail.source && <button type="button" onClick={() => onOpenSource(detail.source!)}>Review source <ArrowRight size={13} /></button>}
                {detail.label === "When" && timeSource && <button type="button" onClick={() => onOpenSource(timeSource)}>Time source <ArrowRight size={13} /></button>}
              </div>
            </article>
          );
        })}
      </section>

      <section className="accident-card accident-narrative">
        <div className="accident-section-heading">
          <span className="accident-section-icon blue">
            <Route size={19} />
          </span>
          <div>
            <span className="accident-kicker">RECORDED CONTEXT</span>
            <h2>How it happened</h2>
          </div>
        </div>
        <div className="accident-narrative-body">
          <blockquote>{narrative || "No incident narrative was imported."}</blockquote>
          <p>
            This summary uses the recorded case summary or matter description. Details
            not present in the record are left unfilled rather than inferred.
          </p>
          {narrativeSource && (
            <button type="button" onClick={() => onOpenSource(narrativeSource)}>
              Review source <ArrowRight size={14} />
            </button>
          )}
        </div>
      </section>

      <section className="accident-card accident-chronology-card">
        <div className="accident-section-heading">
          <span className="accident-section-icon purple">
            <Route size={19} />
          </span>
          <div>
            <span className="accident-kicker">FROM INCIDENT FORWARD</span>
            <h2>What happened next</h2>
          </div>
        </div>
        {chronology.length ? (
          <ol className="accident-chronology">
            {chronology.map((event, index) => (
              <li className={event.isIncident ? "incident" : ""} key={event.id}>
                <div className="accident-chronology-marker">
                  <span>{event.isIncident ? <Car size={17} /> : index}</span>
                </div>
                <time dateTime={event.date}>{formatDate(event.date)}</time>
                <div className="accident-chronology-copy">
                  <strong>{event.title}</strong>
                  <span>{event.category}</span>
                </div>
                {event.source && (
                  <button type="button" onClick={() => onOpenSource(event.source!)}>
                    Source <ArrowRight size={13} />
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="accident-empty">No dated incident activity was imported.</p>
        )}
      </section>

      <section className="accident-card accident-evidence-card">
        <div className="accident-section-heading">
          <span className="accident-section-icon green">
            <FileSearch size={19} />
          </span>
          <div>
            <span className="accident-kicker">TRACEABLE RECORDS</span>
            <h2>Accident-related evidence</h2>
          </div>
          <span className="accident-evidence-count">
            {relatedEvidence.length} {relatedEvidence.length === 1 ? "record" : "records"}
          </span>
        </div>
        {relatedEvidence.length ? (
          <div className="accident-evidence-list">
            {relatedEvidence.map((source) => (
              <button
                type="button"
                key={source.id}
                onClick={() => onOpenSource(source)}
              >
                <span className="accident-evidence-type">{source.type}</span>
                <span>
                  <strong>{source.title}</strong>
                  <small>{accidentSourceValue(source)}</small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        ) : (
          <p className="accident-empty">
            No accident-specific source records were found in this import.
          </p>
        )}
      </section>
    </div>
  );
}

export default AccidentOverview;
