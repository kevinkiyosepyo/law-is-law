import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Clock3,
  Hash,
  HeartPulse,
  Inbox,
  Mail,
  MessageCircle,
  Play,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { MatterSnapshot } from "../shared/types";
import "./integrations.css";

export type DemoConnection = "chatgpt" | "gmail" | "slack";
export type DemoOutcome = "processing" | "approved" | "denied" | "resolved" | "action";
export type DemoCheck = "update" | "empty" | null;
export type DemoEmail = {
  from: string;
  subject: string;
  body: string;
  receivedAt?: string;
  origin: "sample" | "pasted";
};

export const sampleDemoEmails: Record<DemoOutcome, DemoEmail> = {
  processing: {
    from: "Westbridge Memorial Hospital · Patient Financial Services <claims@westbridge-hospital.example>",
    subject: "Claim WBH-204 — insurer review in progress",
    body: "Hello,\n\nWe are following up on hospital claim WBH-204. We sent the itemized charges to Cedarline Health Plan on September 29. The plan acknowledged receipt on October 1 and currently lists the claim as “processing.” No approval, denial, or patient balance has been determined. No action is needed from your office today. We will forward the insurer’s written determination when it arrives.\n\nPatient Financial Services\nWestbridge Memorial Hospital",
    receivedAt: "Oct 1, 2026 · 4:42 PM",
    origin: "sample",
  },
  approved: {
    from: "Westbridge Memorial Hospital · Patient Financial Services <claims@westbridge-hospital.example>",
    subject: "Claim WBH-204 — approval notice received",
    body: "Hello,\n\nCedarline Health Plan has sent us an approval notice for hospital claim WBH-204. The notice lists the covered services and approved amount. Please review the written determination before updating the case record; this email does not establish a final patient balance.\n\nPatient Financial Services\nWestbridge Memorial Hospital",
    receivedAt: "Oct 1, 2026 · 4:42 PM",
    origin: "sample",
  },
  denied: {
    from: "Westbridge Memorial Hospital · Patient Financial Services <claims@westbridge-hospital.example>",
    subject: "Claim WBH-204 — denial notice received",
    body: "Hello,\n\nCedarline Health Plan has denied hospital claim WBH-204. The written notice explains the insurer’s reason and any available appeal process. Please review the notice before deciding whether additional records or a response are needed.\n\nPatient Financial Services\nWestbridge Memorial Hospital",
    receivedAt: "Oct 1, 2026 · 4:42 PM",
    origin: "sample",
  },
  resolved: {
    from: "Westbridge Memorial Hospital · Patient Financial Services <claims@westbridge-hospital.example>",
    subject: "Claim WBH-204 — final determination recorded",
    body: "Hello,\n\nWe received Cedarline Health Plan’s final determination for hospital claim WBH-204 and marked the claim closed in our billing system. A final statement is available for review. Please compare it with the insurer’s written notice before recording the disposition in your case file.\n\nPatient Financial Services\nWestbridge Memorial Hospital",
    receivedAt: "Oct 1, 2026 · 4:42 PM",
    origin: "sample",
  },
  action: {
    from: "Westbridge Memorial Hospital · Patient Financial Services <claims@westbridge-hospital.example>",
    subject: "Claim WBH-204 — additional document requested",
    body: "Hello,\n\nCedarline Health Plan has asked for an additional itemized statement before it can finish reviewing hospital claim WBH-204. Please review the insurer’s request and confirm who will submit the statement through the approved channel. No coverage decision has been issued yet.\n\nPatient Financial Services\nWestbridge Memorial Hospital",
    receivedAt: "Oct 1, 2026 · 4:42 PM",
    origin: "sample",
  },
};
export const sampleDemoEmail = sampleDemoEmails.processing;

const outcomes: Record<DemoOutcome, { label: string; summary: string; next: string }> = {
  processing: {
    label: "“claim processing”",
    summary: "The hospital says the insurer received the claim and it remains under review.",
    next: "Watch for the insurer's decision and follow up with hospital billing if needed.",
  },
  approved: {
    label: "Approved",
    summary: "The example claim is marked approved for this walkthrough.",
    next: "Review the approval notice and confirm the amount and services covered.",
  },
  denied: {
    label: "Denied",
    summary: "The example claim is marked denied for this walkthrough.",
    next: "Review the stated reason and any appeal deadline in the actual notice.",
  },
  resolved: {
    label: "Resolved",
    summary: "The example claim is marked resolved for this walkthrough.",
    next: "Confirm the final disposition against the original correspondence.",
  },
  action: {
    label: "Action required",
    summary: "The example email requests a response from the case team.",
    next: "Open the source email and review the requested action before responding.",
  },
};

const apps = [
  {
    key: "chatgpt" as const,
    name: "ChatGPT",
    description: "Use your existing ChatGPT plan to summarize case updates. Sign in securely, with no API key needed.",
    icon: Sparkles,
    tone: "ai",
  },
  {
    key: "gmail" as const,
    name: "Gmail",
    description: "Ask the patient to connect their Gmail account.",
    icon: Mail,
    tone: "mail",
  },
  {
    key: "slack" as const,
    name: "Slack",
    description: "Preview a case update for your Slack team.",
    icon: Hash,
    tone: "slack",
  },
];

export function Integrations({
  onOpenMyChart,
  myChartLoaded,
  connections,
  onToggleConnection,
  email,
  onEmailChange,
  outcome,
  onOutcomeChange,
  check,
  onPreviewUpdate,
  onPreviewEmpty,
  matter,
}: {
  onOpenMyChart: () => void;
  myChartLoaded: boolean;
  connections: Record<DemoConnection, boolean>;
  onToggleConnection: (key: DemoConnection) => void;
  email: DemoEmail;
  onEmailChange: (email: DemoEmail) => void;
  outcome: DemoOutcome;
  onOutcomeChange: (outcome: DemoOutcome) => void;
  check: DemoCheck;
  onPreviewUpdate: () => void;
  onPreviewEmpty: () => void;
  matter: MatterSnapshot | null;
}) {
  const [draft, setDraft] = useState({ from: "", subject: "", body: "", receivedAt: "" });
  const [showPaste, setShowPaste] = useState(false);
  const ready = connections.chatgpt && connections.gmail;

  function usePastedEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.from.trim() || !draft.subject.trim() || !draft.body.trim()) return;
    onEmailChange({
      from: draft.from.trim(),
      subject: draft.subject.trim(),
      body: draft.body.trim(),
      receivedAt: draft.receivedAt.trim() || undefined,
      origin: "pasted",
    });
    setShowPaste(false);
  }

  return (
    <div className="integrations-page">
      <section className="integrations-hero">
        <div className="integrations-hero-icon"><Sparkles size={24} /></div>
        <div>
          <span className="integrations-kicker">DAILY STATUS CHECK · DEMO</span>
          <h2>See what changed before you open your inbox.</h2>
          <p>A connected version would check hospital and insurer emails at 8:00 a.m. and show claim updates here. Use an email below to try the demo.</p>
        </div>
        <span className="integrations-demo-pill">Demo preview</span>
      </section>

      <div className="integrations-section-heading">
        <div><h2>Connected apps</h2><p>Try the demo connections below.</p></div>
        <span><ShieldCheck size={15} /> No account access requested</span>
      </div>
      <div className="integrations-app-grid">
        {apps.map((app) => (
          <article className="integration-app" key={app.key}>
            <div className="integration-app-top">
              <span className={`integration-app-icon ${app.tone}`}><app.icon size={23} /></span>
              <span className={`integration-state ${connections[app.key] ? "on" : ""}`}>
                {connections[app.key] ? <><Check size={13} /> Demo connected</> : "Not connected"}
              </span>
            </div>
            <h3>{app.name}</h3>
            <p>{app.description}</p>
            {app.key === "chatgpt" && (
              <div className="chatgpt-plan-note" id="chatgpt-plan-note">
                <span>Eligible Plus and Pro plans · Your plan’s usage limits apply</span>
                <span><strong>Demo preview</strong> · No sign-in or plan usage occurs yet.</span>
              </div>
            )}
            <button className={`button ${connections[app.key] ? "secondary" : "primary"}`} aria-describedby={app.key === "chatgpt" ? "chatgpt-plan-note" : undefined} onClick={() => onToggleConnection(app.key)}>
              {connections[app.key] ? "Disconnect demo" : app.key === "chatgpt" ? "Continue with ChatGPT" : `Simulate ${app.name} connection`}
              {!connections[app.key] && <ArrowRight size={15} />}
            </button>
          </article>
        ))}
        <article className="integration-app">
          <div className="integration-app-top">
            <span className="integration-app-icon chart"><HeartPulse size={23} /></span>
            <span className={`integration-state ${myChartLoaded ? "on" : ""}`}>{myChartLoaded ? "Demo loaded" : "Patient portal preview"}</span>
          </div>
          <h3>MyChart</h3>
          <p>Review medical records and preview what the patient includes for their attorney.</p>
          <button className="button primary" onClick={onOpenMyChart}>Open MyChart <ArrowRight size={15} /></button>
        </article>
      </div>

      <div className="integration-workflow-grid">
        <section className="panel integration-source-panel">
          <div className="panel-heading">
            <div><h2>Hospital email source</h2><p>Use a sample email or paste one for the demo.</p></div>
            <Inbox size={20} className="muted" />
          </div>
          <div className="integration-source-body">
            <div className="integration-source-type">
              <span className={`integration-source-dot ${email.origin}`} />
              {email.origin === "sample" ? "Fictional Gmail-style email" : "Pasted email · not verified"}
            </div>
            <div className="integration-email">
              <div><span>From</span><strong>{email.from}</strong></div>
              <div><span>Subject</span><strong>{email.subject}</strong></div>
              {email.receivedAt && <div><span>Received</span><strong>{email.receivedAt}</strong></div>}
              <p>{email.body}</p>
            </div>
            <div className="integration-source-actions">
              <button className="button secondary" onClick={() => setShowPaste((value) => !value)}>{showPaste ? "Close email form" : "Paste a Gmail email"}</button>
              {email.origin === "pasted" && <button className="text-button" onClick={() => onEmailChange(sampleDemoEmails[outcome])}>Use sample instead</button>}
            </div>
            {showPaste && (
              <form className="integration-email-form" onSubmit={usePastedEmail}>
                <label>From<input required value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} placeholder="Hospital name and sender email" /></label>
                <label>Subject<input required value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} placeholder="Email subject" /></label>
                <label>Received (optional)<input value={draft.receivedAt} onChange={(event) => setDraft({ ...draft, receivedAt: event.target.value })} placeholder="Oct 1, 2026 · 4:42 PM" /></label>
                <label>Message<textarea required rows={5} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="Paste the hospital email body" /></label>
                <p>Remove patient identifiers before presenting. The pasted text stays in this browser session.</p>
                <button className="button primary" type="submit">Use this email in demo</button>
              </form>
            )}
          </div>
        </section>

        <section className="panel integration-check-panel">
          <div className="panel-heading">
            <div><h2>8:00 a.m. status check</h2><p>Show the update your dashboard would present.</p></div>
            <Clock3 size={20} className="muted" />
          </div>
          <div className="integration-check-body">
            <div className="integration-schedule"><Clock3 size={19} /><div><strong>Every day at 8:00 a.m.</strong><span>Schedule preview · no background check runs in this demo</span></div></div>
            <div className="integration-flow">
              <span><Mail size={16} /> Gmail source</span><ArrowRight size={15} /><span><Sparkles size={16} /> Demo summary</span><ArrowRight size={15} /><span><Bell size={16} /> Dashboard alert</span>
            </div>
            <label className="integration-outcome-label" htmlFor="demo-outcome">Demo status shown for this email</label>
            <select id="demo-outcome" value={outcome} onChange={(event) => onOutcomeChange(event.target.value as DemoOutcome)}>
              {Object.entries(outcomes).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
            </select>
            <p className="integration-manual-note">You choose this status for the presentation. The app does not analyze the email.</p>
            <div className="integration-preview-actions">
              <button className="button primary" disabled={!ready} onClick={onPreviewUpdate}><Play size={15} /> Preview new update</button>
              <button className="button secondary" disabled={!ready} onClick={onPreviewEmpty}>Preview no updates</button>
            </div>
            {!ready && <p className="integration-hint">Connect ChatGPT and Gmail in the demo to preview updates.</p>}
            {check && <div className={`integration-check-result ${check}`} role="status">
              {check === "update" ? <><CheckCircle2 size={17} /><span>Demo update prepared for {email.origin === "sample" ? "an illustrative claim" : matter?.clientName || "the selected matter"}. Open Overview to see its status card.</span></> : <><Inbox size={17} /><span>No new updates from hospitals or insurance companies.</span></>}
            </div>}
          </div>
        </section>
      </div>
      <p className="integration-disclosure"><MessageCircle size={15} /> ChatGPT, Gmail, Slack, and MyChart are demos here. No live account access, automated analysis, scheduled job, or message delivery is active.</p>
    </div>
  );
}

export function StatusUpdatesPreview({ check, email, outcome, onOpenUpdate, onOpenIntegrations }: {
  check: DemoCheck;
  email: DemoEmail;
  outcome: DemoOutcome;
  onOpenUpdate: () => void;
  onOpenIntegrations: () => void;
}) {
  return <section className="status-preview panel" aria-label="Status updates">
    <div className="status-preview-icon"><Bell size={20} /></div>
    <div className="status-preview-copy">
      <span>STATUS UPDATES <em>DEMO</em></span>
      <h2>{check === "update" ? outcomes[outcome].label : check === "empty" ? "All caught up" : "Your 8:00 a.m. update preview"}</h2>
      <p>{check === "update" ? `${outcomes[outcome].summary} Source: ${email.origin === "sample" ? "fictional hospital email" : "pasted hospital email"}.` : check === "empty" ? "No new updates from hospitals or insurance companies." : "Connect the demo apps and run a sample inbox check to see updates here."}</p>
    </div>
    <button className="button secondary" onClick={check === "update" ? onOpenUpdate : onOpenIntegrations}>{check === "update" ? "View update" : "Open Integrations"}<ArrowRight size={15} /></button>
  </section>;
}

export function UpdateDialog({ email, outcome, matter, onClose }: {
  email: DemoEmail;
  outcome: DemoOutcome;
  matter: MatterSnapshot | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <div className="update-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="update-modal" role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
      <div className="update-modal-top"><span><Bell size={16} /> 8:00 A.M. STATUS CHECK <em>DEMO</em></span><button ref={closeRef} className="icon-button" aria-label="Close update" onClick={onClose}><X size={18} /></button></div>
      <div className="update-modal-main">
        <span className="update-modal-symbol"><CheckCircle2 size={25} /></span>
        <h2 id="update-modal-title">New claim update</h2>
        <p className="update-modal-case">{email.origin === "sample" ? "Illustrative claim · no matter linked" : matter ? `${matter.clientName} · ${matter.number}` : "Selected matter"}</p>
        <div className="update-modal-status"><span>STATUS</span><strong>{outcomes[outcome].label}</strong></div>
        <p>{outcomes[outcome].summary}</p>
        <div className="update-modal-next"><strong>Suggested next step</strong><p>{outcomes[outcome].next}</p></div>
        <div className="update-modal-source"><span>{email.origin === "sample" ? "FICTIONAL GMAIL-STYLE EMAIL" : "PASTED EMAIL · NOT VERIFIED"}</span><strong>{email.subject}</strong><small>{email.from}{email.receivedAt ? ` · ${email.receivedAt}` : ""}</small><p>{email.body}</p></div>
        <p className="update-modal-footnote">Presentation preview. Verify any real claim status and next step against the original message.</p>
      </div>
      <div className="update-modal-footer"><button className="button primary" onClick={onClose}>Done</button></div>
    </section>
  </div>;
}
