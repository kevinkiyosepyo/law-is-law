import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, ClipboardList, FileText, HeartPulse, Info, Link2, LockKeyhole, Mail, MessageCircle, Plus, Search, ShieldCheck, Unplug, Users, Wallet } from "lucide-react";
import type { MatterSnapshot, SourceRecord } from "../shared/types";
import { chartKinds, connectChartDemo, filterChartRecords, previewChartSharing, validateChartDraft, type ChartDraft, type ChartKind, type ChartRecord, type ChartSession } from "../shared/mychart";
import "./mychart.css";

const kindIcons = { record: FileText, message: MessageCircle, appointment: CalendarDays, billing: Wallet, notification: Mail };
const originLabels = { fictional: "Fictional portal example", "case-excerpt": "Existing sample case excerpt", pasted: "Pasted text · unverified" };
const recordDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function MyChart({ matter, session, onChange, onSource }: {
  matter: MatterSnapshot;
  session: ChartSession;
  onChange: (update: (previous: ChartSession) => ChartSession) => void;
  onSource: (source: SourceRecord) => void;
}) {
  const [mode, setMode] = useState<"patient" | "attorney">("patient");
  const [kind, setKind] = useState<ChartKind | "all">("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [connectionForm, setConnectionForm] = useState(false);
  const [demoConsent, setDemoConsent] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState("");
  const [draftError, setDraftError] = useState("");
  const [draft, setDraft] = useState<ChartDraft>({ title: "", provider: "", date: matter.asOf.slice(0, 10), kind: "record", body: "" });
  const visibleRecords = useMemo(() => mode === "patient" ? session.records : session.records.filter((record) => session.sharedIds.includes(record.id)), [mode, session.records, session.sharedIds]);
  const records = useMemo(() => filterChartRecords(visibleRecords, kind, query), [visibleRecords, kind, query]);
  const active = records.find((record) => record.id === activeId) ?? records[0];
  const original = active?.sourceId ? matter.sources.find((source) => source.id === active.sourceId) : undefined;
  const selectedCount = selectedIds.length;
  const pendingCount = session.records.filter((record) => record.kind !== "notification" && !session.sharedIds.includes(record.id)).length;

  function toggleSelection(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setReviewed(false);
  }
  function changeMode(next: "patient" | "attorney") {
    setMode(next); setKind("all"); setQuery(""); setActiveId(null);
    setSelectedIds([]); setReviewed(false); setShowAdd(false); setConnectionForm(false);
  }
  function connect() {
    if (!demoConsent || matter.sourceMode !== "sample") return;
    onChange((current) => connectChartDemo(current, matter));
    setConnectionForm(false); setDemoConsent(false);
    setNotice("Fictional portal preview loaded. No MyChart account was accessed.");
  }
  function share() {
    if (!reviewed || !selectedCount) return;
    onChange((current) => previewChartSharing(current, selectedIds, reviewed));
    setNotice(`${selectedCount} ${selectedCount === 1 ? "item added" : "items added"} to the attorney preview. Nothing was sent or saved to the case.`);
    setSelectedIds([]); setReviewed(false);
  }
  function addRecord(event: FormEvent) {
    event.preventDefault();
    const error = validateChartDraft(draft);
    if (error) { setDraftError(error); return; }
    const record: ChartRecord = {
      id: `${matter.id}:chart:pasted:${crypto.randomUUID()}`, kind: draft.kind as ChartKind,
      title: draft.title.trim(), provider: draft.provider.trim(), date: draft.date,
      body: draft.body.trim(), summary: "Manually added record text. Source and completeness have not been verified.", origin: "pasted",
    };
    onChange((current) => ({ ...current, records: [...current.records, record] }));
    setActiveId(record.id); setKind("all"); setQuery(""); setShowAdd(false); setDraftError("");
    setDraft({ title: "", provider: "", date: matter.asOf.slice(0, 10), kind: "record", body: "" });
    setNotice("Record text added to this matter’s browser-session preview. It has not been included in the attorney preview.");
  }

  return (
    <div className="mychart-page">
      <section className="chart-hero">
        <span className="chart-hero-icon"><HeartPulse size={28} /></span>
        <div><span className="chart-kicker">PATIENT PORTAL · DEMO</span><h2>A clearer picture of care.</h2><p>Bring medical records, provider messages, and treatment updates into the case—one reviewed item at a time.</p></div>
        <span className="chart-pill">No live account access</span>
      </section>

      <div className="chart-toolbar">
        <div><h2>One case. Two perspectives.</h2><p>Role previews only. This workspace does not yet have separate patient accounts.</p></div>
        <div className="chart-mode" role="group" aria-label="MyChart perspective preview">
          <button aria-pressed={mode === "patient"} onClick={() => changeMode("patient")}><HeartPulse size={15} /> Patient preview</button>
          <button aria-pressed={mode === "attorney"} onClick={() => changeMode("attorney")}><Users size={15} /> Attorney preview</button>
        </div>
      </div>

      {notice && <div className="chart-notice" role="status"><CheckCircle2 size={17} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss MyChart notice">×</button></div>}

      <section className="panel chart-connection" aria-label="Patient portal connection">
        <div className="chart-connection-main">
          <span className="chart-provider-icon"><Link2 size={22} /></span>
          <div><h3>{session.connected ? "Fictional care network · demo loaded" : "Patient’s MyChart connection"}</h3><p>{matter.clientName} <span aria-hidden="true">·</span> {session.connected ? "Sample data only; no live sync" : "No portal connected"}</p></div>
          {mode === "patient" && <div className="chart-connection-actions">
            <button className="button secondary" onClick={() => { setShowAdd(!showAdd); setDraftError(""); }} aria-expanded={showAdd} aria-controls="chart-add-record"><Plus size={15} /> {showAdd ? "Close record form" : "Add record text"}</button>
            {session.connected ? <button className="button secondary" onClick={() => { onChange((current) => ({ ...current, connected: false })); setNotice("Demo connection removed. Existing preview records are retained; refresh the page to clear all MyChart session data."); }}><Unplug size={15} /> Disconnect demo</button>
              : matter.sourceMode === "sample" ? <button className="button primary" aria-expanded={connectionForm} aria-controls="chart-consent" onClick={() => { setConnectionForm(!connectionForm); setDemoConsent(false); }}>Preview connection <ArrowRight size={15} /></button>
              : <span className="chart-pill neutral">Live integration not configured</span>}
          </div>}
        </div>
        {connectionForm && mode === "patient" && <div className="chart-consent" id="chart-consent">
          <div><ShieldCheck size={20} /><div><h3>Preview patient authorization</h3><p>Load sample records for this matter. Provider names are story context, not a claim that those providers use MyChart. Loading records does not include them in the attorney preview.</p></div></div>
          <label><input type="checkbox" checked={demoConsent} onChange={(event) => setDemoConsent(event.target.checked)} /> I understand this loads a fictional walkthrough, not my real health account.</label>
          <button className="button primary" disabled={!demoConsent} onClick={connect}>Load demo records</button>
        </div>}
        <p className="chart-connection-note"><LockKeyhole size={13} /> No MyChart password requested. Live access would require a supported provider integration and patient authorization. <a href="https://www.mychart.org/" target="_blank" rel="noreferrer">Find your actual portal ↗</a></p>
      </section>

      {showAdd && mode === "patient" && <section className="panel chart-add" id="chart-add-record">
        <div><h2>Add a record to the preview</h2><p>Use fictional or de-identified text copied from a record you may use. It stays in browser memory, is lost on refresh, and is not uploaded to the server.</p></div>
        <form onSubmit={addRecord}>
          <div className="chart-form-grid">
            <label>Record title<input required maxLength={180} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="After-visit summary" /></label>
            <label>Provider or organization<input required maxLength={180} value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value })} placeholder="Example care team" /></label>
            <label>Record date<input required type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
            <label>Record type<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}>{Object.entries(chartKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <label>Record text<textarea required rows={5} maxLength={20000} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="Paste de-identified record text. No passwords or sign-in codes." /></label>
          {draftError && <p role="alert" className="chart-error">{draftError}</p>}
          <div className="chart-form-actions"><button type="submit" className="button primary">Add to patient preview</button><button type="button" className="button secondary" onClick={() => setShowAdd(false)}>Cancel</button></div>
        </form>
      </section>}

      <div className="chart-stats">
        <div><span><ClipboardList size={17} /> {mode === "patient" ? "Available items" : "Items in attorney preview"}</span><strong>{visibleRecords.length}</strong><small>{mode === "patient" ? "Records and notifications in this session" : "Only individually selected records"}</small></div>
        <div><span><ShieldCheck size={17} /> {mode === "patient" ? "Ready for review" : "Original case unchanged"}</span><strong>{mode === "patient" ? pendingCount : "Read-only"}</strong><small>{mode === "patient" ? "Not yet in the attorney preview" : "Nothing added to evidence or finances"}</small></div>
        <div><span><Users size={17} /> Attorney preview</span><strong>{session.sharedIds.length}</strong><small>Preview only · no actual delivery</small></div>
      </div>

      <section className="panel chart-records" aria-label="MyChart records">
        <div className="panel-heading"><div><h2>{mode === "patient" ? "Patient record inbox" : "Attorney review packet"}</h2><p>{mode === "patient" ? "Review the content before including it in the attorney preview." : "These are the items selected in the patient preview—not a separate secure login."}</p></div><span className="chart-pill neutral">Session only</span></div>
        <div className="chart-filters">
          <div className="chart-tabs" role="group" aria-label="Filter MyChart record types">{(["all", ...Object.keys(chartKinds)] as (ChartKind | "all")[]).map((value) => <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{value === "all" ? "All items" : chartKinds[value]}<span>{value === "all" ? visibleRecords.length : visibleRecords.filter((record) => record.kind === value).length}</span></button>)}</div>
          <label className="chart-search"><Search size={16} /><input aria-label="Search MyChart records" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records or providers…" /></label>
        </div>

        {records.length ? <div className="chart-record-layout">
          <div className="chart-record-list" aria-label="Available MyChart items">{records.map((record) => {
            const Icon = kindIcons[record.kind];
            const included = session.sharedIds.includes(record.id);
            return <article className={`chart-row ${active?.id === record.id ? "active" : ""}`} key={record.id}>
              {mode === "patient" && record.kind !== "notification" && !included && <input aria-label={`Select ${record.title} for attorney preview`} type="checkbox" checked={selectedIds.includes(record.id)} onChange={() => toggleSelection(record.id)} />}
              <button className="chart-record-button" onClick={() => setActiveId(record.id)} aria-pressed={active?.id === record.id} aria-controls="chart-record-detail">
                <span className={`chart-kind-icon ${record.kind}`}><Icon size={17} /></span><span className="chart-row-content"><span className="chart-row-meta">{recordDate(record.date)}{included && <span><Check size={11} /> In attorney preview</span>}</span><strong>{record.title}</strong><span className="chart-row-provider">{record.provider}</span><span className="chart-row-summary">{record.summary}</span></span><ChevronRight size={15} />
              </button>
            </article>;
          })}</div>
          {active && <article className="chart-detail" id="chart-record-detail" aria-label="Selected record details">
            <div className="chart-detail-meta"><span className={`chart-detail-kind ${active.kind}`}>{chartKinds[active.kind]}</span><span>{recordDate(active.date)}</span></div>
            <h3>{active.title}</h3><p className="chart-detail-provider">{active.provider}</p>
            <div className="chart-provenance"><Info size={14} /><span>{originLabels[active.origin]} · {active.origin === "pasted" ? "not verified against a portal" : "not retrieved from MyChart"}</span></div>
            <p className="chart-record-body">{active.body}</p>
            {active.nextStep && <div className="chart-next"><strong>What needs to happen next</strong><p>{active.nextStep}</p></div>}
            {original && mode === "patient" && <button className="text-button chart-source" onClick={() => onSource(original)}><FileText size={14} /> View related case source <ArrowRight size={13} /></button>}
            {active.kind === "notification" ? <p className="chart-missing"><Mail size={16} /> Notification only. The actual record is missing, so this item cannot be added to the attorney preview.</p>
              : mode === "patient" && (session.sharedIds.includes(active.id) ? <button className="button secondary" onClick={() => { onChange((current) => ({ ...current, sharedIds: current.sharedIds.filter((id) => id !== active.id) })); setNotice("Item removed from the attorney preview. No real recipient or downloaded copy is affected."); }}>Remove from attorney preview</button>
                : <button className="button secondary" onClick={() => toggleSelection(active.id)}>{selectedIds.includes(active.id) ? <Check size={15} /> : <Plus size={15} />}{selectedIds.includes(active.id) ? "Deselect this record" : "Select for attorney preview"}</button>)}
          </article>}
        </div> : <div className="chart-empty"><span><HeartPulse size={28} /></span><h3>{query || kind !== "all" ? "No matching records" : mode === "attorney" ? "No records selected for the attorney" : "Start with the patient’s records"}</h3><p>{query || kind !== "all" ? "Try another record type or a different search." : mode === "attorney" ? "Switch to the patient preview, review a record, and explicitly include it here." : matter.sourceMode === "sample" ? "Preview a connection to load sample data, or add de-identified record text. Your saved case stays unchanged." : "Add de-identified record text to try the review flow. Live portal access is not configured, and your saved case stays unchanged."}</p>{(query || kind !== "all") && <button className="button secondary" onClick={() => { setQuery(""); setKind("all"); }}>Clear filters</button>}{mode === "attorney" && !query && kind === "all" && <button className="button secondary" onClick={() => changeMode("patient")}>Open patient preview</button>}</div>}

        {mode === "patient" && selectedCount > 0 && <div className="chart-share-bar"><div><strong>{selectedCount} {selectedCount === 1 ? "record" : "records"} selected across all filters</strong><label><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} /> I reviewed the selected records for this case. Preview only; no actual consent or delivery.</label></div><div className="chart-share-actions"><button className="text-button" onClick={() => { setSelectedIds([]); setReviewed(false); }}>Clear selection</button><button className="button primary" disabled={!reviewed} onClick={share}><Users size={15} /> Add to attorney preview</button></div></div>}
      </section>

      <div className="chart-footnotes"><p><ShieldCheck size={16} /><span>Records and selection changes stay in memory for this browser session and clear on refresh or sign-out. Switching matters keeps each preview separate. No AI processing, live sync, messages, or case-file changes occur.</span></p><p><Info size={16} /><span>A Gmail notification may point to MyChart without containing the record itself. Download the actual document or use an authorized provider connection when available. <a href="https://www.mychart.org/l/en-us/explore/" target="_blank" rel="noreferrer">About MyChart capabilities ↗</a></span></p></div>
    </div>
  );
}
