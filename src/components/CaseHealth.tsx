import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  FileCheck,
  FileX,
  Lock,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type {
  Blocker,
  MatterSnapshot,
  SourceRecord,
} from "../../shared/types";

interface CaseHealthProps {
  matter: MatterSnapshot;
  onOpenSource?: (source: SourceRecord) => void;
  onProviderView?: () => void;
}

interface CaseMetrics {
  coverage: string;
  expenses: string;
  lastContact: string;
}

const journeySteps = [
  { icon: "🚗", label: "Accident" },
  { icon: "🏥", label: "ER" },
  { icon: "◉", label: "MRI", highlighted: true },
  { icon: "＋", label: "PT" },
  { icon: "⚕", label: "Specialist" },
];

const priorityLabels: Record<Blocker["priority"], string> = {
  high: "Critical",
  medium: "Follow up",
  low: "Monitor",
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

function CaseHealth({
  matter,
  onOpenSource,
  onProviderView,
}: CaseHealthProps) {
  const coverage = matter.facts.find((fact) =>
    fact.label.toLowerCase().includes("coverage"),
  );
  const expenses = matter.facts.find((fact) =>
    fact.label.toLowerCase().includes("expense"),
  );
  const communicationDates = matter.sources
    .filter((source) => source.type === "communication" && source.date)
    .map((source) => new Date(source.date!).getTime())
    .filter(Number.isFinite);
  const lastContactTime = communicationDates.length
    ? Math.max(...communicationDates)
    : new Date(matter.asOf).getTime();
  const daysSinceContact = Number.isFinite(lastContactTime)
    ? Math.max(
        0,
        Math.floor((Date.now() - lastContactTime) / (1000 * 60 * 60 * 24)),
      )
    : 0;
  const metrics: CaseMetrics = {
    coverage: coverage?.value || "Not recorded",
    expenses: expenses?.value || "$0",
    lastContact:
      daysSinceContact === 0
        ? "Today"
        : `${daysSinceContact} ${daysSinceContact === 1 ? "day" : "days"} ago`,
  };

  const urgentBlockers = [...matter.blockers]
    .sort((a, b) => {
      const weight = { high: 0, medium: 1, low: 2 };
      return weight[a.priority] - weight[b.priority];
    })
    .slice(0, 3);
  const recentChanges = [...matter.events]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);
  const documents = matter.sources.filter((source) => source.type === "document");
  const documentStatus = [
    "MRI report",
    "PT records",
    "Final bill",
    "Updated treatment notes",
  ].map((name) => ({
    name,
    complete: documents.some((document) =>
      document.title.toLowerCase().includes(name.toLowerCase()),
    ),
  }));

  return (
    <div className="case-health-dashboard">
      <section className="case-health-hero" aria-labelledby="case-health-client">
        <div className="case-health-hero-glow" />
        <div className="case-health-hero-main">
          <div className="case-health-status">
            <span aria-hidden="true" />
            {matter.status} · {matter.stage}
          </div>
          <h2 id="case-health-client">{matter.clientName}</h2>
          <p className="case-health-matter-number">Matter {matter.number}</p>
        </div>
        <div className="case-health-brief">
          <Clock3 size={17} />
          <span>Catch me up in</span>
          <strong>90 seconds</strong>
        </div>
      </section>

      <section className="case-health-card case-health-summary">
        <div className="case-health-section-heading">
          <div>
            <span className="case-health-kicker">AT A GLANCE</span>
            <h2>Case health</h2>
          </div>
          <span className="case-health-updated">
            Updated {formatDate(matter.asOf)}
          </span>
        </div>
        <div className="case-health-metrics">
          <div className="case-health-metric">
            <span>Coverage</span>
            <strong>{metrics.coverage}</strong>
            <small>Policy limit</small>
          </div>
          <div className="case-health-metric">
            <span>Expenses</span>
            <strong>{metrics.expenses}</strong>
            <small>Recorded to date</small>
          </div>
          <div className="case-health-metric">
            <span>Last contact</span>
            <strong>{metrics.lastContact}</strong>
            <small>Latest communication</small>
          </div>
        </div>
      </section>

      <div className="case-health-top-grid">
        <section className="case-health-card case-health-attention">
          <div className="case-health-section-heading">
            <div className="case-health-heading-with-icon">
              <span className="case-health-icon coral">
                <AlertCircle size={18} />
              </span>
              <div>
                <span className="case-health-kicker">PRIORITIES</span>
                <h2>Needs attention</h2>
              </div>
            </div>
            <span className="case-health-count">{urgentBlockers.length}</span>
          </div>
          <div className="case-health-attention-list">
            {urgentBlockers.length ? (
              urgentBlockers.map((blocker) => (
                <article className="case-health-attention-item" key={blocker.id}>
                  <span
                    className={`case-health-priority-dot ${blocker.priority}`}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="case-health-item-title">
                      <h3>{blocker.title}</h3>
                      <span className={`case-health-priority ${blocker.priority}`}>
                        {priorityLabels[blocker.priority]}
                      </span>
                    </div>
                    <p>{blocker.description}</p>
                  </div>
                </article>
              ))
            ) : (
              <div className="case-health-clear-state">
                <Check size={18} /> No items need immediate attention.
              </div>
            )}
          </div>
        </section>

        <section className="case-health-card case-health-changes">
          <div className="case-health-section-heading">
            <div className="case-health-heading-with-icon">
              <span className="case-health-icon blue">
                <Sparkles size={18} />
              </span>
              <div>
                <span className="case-health-kicker">ACTIVITY</span>
                <h2>Since your last visit</h2>
              </div>
            </div>
          </div>
          <div className="case-health-change-total">
            <strong>{recentChanges.length}</strong>
            <span>meaningful changes</span>
          </div>
          {recentChanges[0] && (
            <div className="case-health-latest-change">
              <span>Latest</span>
              <strong>{recentChanges[0].title}</strong>
              <small>{formatDate(recentChanges[0].date)}</small>
            </div>
          )}
        </section>
      </div>

      <section className="case-health-card case-health-journey-card">
        <div className="case-health-section-heading">
          <div className="case-health-heading-with-icon">
            <span className="case-health-icon blue">
              <TrendingUp size={18} />
            </span>
            <div>
              <span className="case-health-kicker">TREATMENT PROGRESS</span>
              <h2>Medical journey</h2>
            </div>
          </div>
        </div>
        <ol className="case-health-journey" aria-label="Medical journey">
          {journeySteps.map((step, index) => (
            <li className={step.highlighted ? "highlighted" : ""} key={step.label}>
              <div className="case-health-journey-step">
                <span className="case-health-journey-icon" aria-hidden="true">
                  {step.icon}
                </span>
                <strong>{step.label}</strong>
                {step.highlighted && <small>New diagnosis</small>}
              </div>
              {index < journeySteps.length - 1 && (
                <span className="case-health-journey-line" aria-hidden="true">
                  <ArrowRight size={17} />
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className="case-health-bottom-grid">
        <section className="case-health-card">
          <div className="case-health-section-heading">
            <div className="case-health-heading-with-icon">
              <span className="case-health-icon purple">
                <CalendarDays size={18} />
              </span>
              <div>
                <span className="case-health-kicker">RECENT TIMELINE</span>
                <h2>Case story</h2>
              </div>
            </div>
          </div>
          <div className="case-health-story">
            {recentChanges.map((event) => {
              const source = matter.sources.find((item) =>
                event.sourceIds.includes(item.id),
              );
              return (
                <article className="case-health-story-item" key={event.id}>
                  <time dateTime={event.date}>{formatDate(event.date)}</time>
                  <div>
                    <strong>{event.title}</strong>
                    <span>{event.category}</span>
                  </div>
                  <button
                    type="button"
                    disabled={!source || !onOpenSource}
                    onClick={() => source && onOpenSource?.(source)}
                  >
                    Source <ArrowRight size={13} />
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="case-health-card">
          <div className="case-health-section-heading">
            <div className="case-health-heading-with-icon">
              <span className="case-health-icon amber">
                <FileCheck size={18} />
              </span>
              <div>
                <span className="case-health-kicker">DOCUMENT CHECK</span>
                <h2>Missing pieces</h2>
              </div>
            </div>
          </div>
          <div className="case-health-documents">
            {documentStatus.map((document) => (
              <div
                className={document.complete ? "complete" : "missing"}
                key={document.name}
              >
                <span>
                  {document.complete ? <Check size={15} /> : <FileX size={15} />}
                </span>
                <div>
                  <strong>{document.name}</strong>
                  <small>{document.complete ? "On file" : "Still needed"}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="case-health-provider">
        <div className="case-health-provider-icon">
          <Lock size={20} />
        </div>
        <div>
          <span className="case-health-kicker">SECURE SHARING</span>
          <h2>Ready to update a provider?</h2>
          <p>Share an attorney-approved view without exposing the full case file.</p>
        </div>
        <button type="button" onClick={onProviderView} disabled={!onProviderView}>
          Provider view <ArrowRight size={16} />
        </button>
      </section>
    </div>
  );
}

export default CaseHealth;
