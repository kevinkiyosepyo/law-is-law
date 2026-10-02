import { Fragment, useMemo, useState } from "react";
import {
  ArrowDownToLine, ArrowRight, CheckCircle2, ChevronDown, CircleAlert,
  Clock3, CreditCard, FileText, ReceiptText, Search, ShieldCheck, Wallet, X,
} from "lucide-react";
import { deriveFinances, type FinanceAmountTotal, type FinanceLedgerRow, type LedgerAmountKey } from "../shared/finances";
import type { MatterSnapshot, SourceRecord } from "../shared/types";
import "./finances.css";

const money = (cents: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0,
  maximumFractionDigits: 2,
}).format(cents / 100);

const amountLabels: Record<LedgerAmountKey, string> = {
  billed: "Medical charges", insurancePaid: "Insurance paid", patientPaid: "Patient paid",
  adjustments: "Adjustments & write-offs", outstanding: "Statement balance",
  patientResponsibility: "Patient balance", insurancePending: "Pending insurance",
  insuranceDenied: "Denied by insurance",
};
const statuses = {
  confirmed: "Confirmed", recorded: "Recorded", pending: "Pending",
  disputed: "Disputed", unknown: "Needs records",
};
const displayDate = (value?: string) => value
  ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  : "Date not recorded";

function needsReview(row: FinanceLedgerRow) {
  return row.status !== "confirmed" ||
    ["insurancePaid", "patientPaid", "outstanding", "patientResponsibility"].some((key) => row.amounts[key as LedgerAmountKey] === null);
}

function RecordLinks({ ids, matter, onSource }: {
  ids: string[]; matter: MatterSnapshot; onSource: (source: SourceRecord) => void;
}) {
  return <div className="finance-sources">
    {ids.map((id) => matter.sources.find((source) => source.id === id)).filter((source): source is SourceRecord => !!source).map((source) => (
      <button type="button" className="source-button" key={source.id} onClick={() => onSource(source)} title={source.title}>
        <FileText size={13} /><span>{source.title}</span><ArrowRight size={12} />
      </button>
    ))}
  </div>;
}

function Amount({ value }: { value: number | null }) {
  return value === null
    ? <span className="finance-unknown">Not recorded</span>
    : <span className="finance-money">{money(value)}</span>;
}

function TotalNote({ total }: { total: FinanceAmountTotal }) {
  if (!total.knownCount) return <>Awaiting payment records</>;
  return <>{total.knownCount} of {total.totalCount} provider{total.totalCount === 1 ? "" : "s"}{total.state === "partial" ? " · Partial total" : " · Recorded total"}</>;
}

function Status({ value }: { value: FinanceLedgerRow["status"] }) {
  return <span className={`finance-status ${value}`}>
    <span aria-hidden="true" />{statuses[value]}
  </span>;
}

function exportLedger(matter: MatterSnapshot, rows: FinanceLedgerRow[]) {
  const keys = Object.keys(amountLabels) as LedgerAmountKey[];
  const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  const header = ["Matter", "As of", "Provider", "Record date", "Status", ...keys.map((key) => `${amountLabels[key]} (USD)`), "Source references", "Notes"];
  const csv = [header, ...rows.map((row) => [
    matter.clientName, matter.asOf, row.providerName, row.date || "Not recorded", statuses[row.status],
    ...keys.map((key) => row.amounts[key] === null ? "Not recorded" : (row.amounts[key]! / 100).toFixed(2)),
    row.sourceIds.map((id) => {
      const source = matter.sources.find((item) => item.id === id);
      return source ? `${source.title} (${source.locator || source.id})` : id;
    }).join("; "), row.notes.join("; "),
  ])].map((row) => row.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${matter.number.replace(/[^a-zA-Z0-9_-]/g, "-")}-finances-${matter.asOf}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Finances({ matter, onSource, onImport }: {
  matter: MatterSnapshot; onSource: (source: SourceRecord) => void; onImport: () => void;
}) {
  const finance = useMemo(() => deriveFinances(matter), [matter]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const reviewCount = finance.rows.filter(needsReview).length;
  const missingPaymentCount = finance.rows.filter((row) => Object.values(row.amounts).some((amount) => amount === null)).length;
  const visible = finance.rows.filter((row) =>
    row.providerName.toLowerCase().includes(search.trim().toLowerCase()) &&
    (filter === "all" || (filter === "review" && needsReview(row)) ||
      (filter === "balance" && (row.amounts.outstanding ?? 0) > 0) ||
      (filter === "confirmed" && row.status === "confirmed")),
  );
  const cards = [
    { key: "billed" as const, icon: ReceiptText, tone: "blue", description: "Charges in the available medical bills" },
    { key: "insurancePaid" as const, icon: ShieldCheck, tone: "green", description: "Payments attributed to an insurer" },
    { key: "patientPaid" as const, icon: CreditCard, tone: "purple", description: "Payments made by the patient" },
    { key: "patientResponsibility" as const, icon: Wallet, tone: "amber", description: "Remaining patient responsibility, as recorded" },
  ];

  return <div className="finances-view">
    <div className="finance-summary-grid" aria-label="Medical payment summary">
      {cards.map(({ key, icon: Icon, tone, description }) => {
        const total = finance.totals[key];
        return <section className={`finance-summary-card ${tone}`} key={key} aria-label={amountLabels[key]}>
          <div className="finance-card-heading"><span>{amountLabels[key]}</span><span className="finance-card-icon"><Icon size={18} /></span></div>
          <div className={`finance-card-value ${total.amount === null ? "unknown" : ""}`}>
            {total.amount === null ? "Not recorded" : money(total.amount)}
          </div>
          <p>{description}</p>
          <div className={`finance-total-note ${total.state === "partial" ? "partial" : ""}`}>
            {total.state === "partial" ? <CircleAlert size={12} /> : total.amount === null ? <Clock3 size={12} /> : <FileText size={12} />}
            <TotalNote total={total} />
          </div>
        </section>;
      })}
    </div>

    <div className={`finance-reconciliation ${reviewCount || !finance.rows.length ? "incomplete" : "complete"}`}>
      <span className="finance-reconciliation-icon">{reviewCount || !finance.rows.length ? <CircleAlert size={20} /> : <CheckCircle2 size={20} />}</span>
      <div>
        <strong>{!finance.rows.length ? "Add billing records to see payment details" : missingPaymentCount ? "Some payment details still need confirmation" : reviewCount ? "Payment records are complete. Insurance follow-up is still open." : "Payment details are available for every provider"}</strong>
        <p>{!finance.rows.length
          ? "Import provider statements and payment records to see charges, payments, and balances here."
          : missingPaymentCount
            ? `${reviewCount} of ${finance.rows.length} providers have missing or unconfirmed payment details. Unpaid charges are not automatically the patient's responsibility.`
            : reviewCount
              ? `${reviewCount} of ${finance.rows.length} providers have items to review. Open a provider for payment details, remaining patient amounts, and insurance follow-up.`
            : "Amounts reflect the available statements. Open a provider to review its figures and supporting records."}</p>
      </div>
      {!!reviewCount && <button className="text-button" onClick={() => {
        setFilter("review"); setSearch("");
        document.getElementById("finance-ledger")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      }}>Review details <ArrowRight size={15} /></button>}
    </div>

    <section className="panel finance-ledger-panel" id="finance-ledger" aria-labelledby="finance-ledger-title">
      <div className="panel-heading">
        <div><h2 id="finance-ledger-title">Provider balances</h2><p>Follow each provider’s charges, payments, and remaining balance.</p></div>
        <button className="button secondary" disabled={!finance.rows.length} onClick={() => { exportLedger(matter, finance.rows); setExported(true); }}>
          <ArrowDownToLine size={15} />Export CSV
        </button>
      </div>
      <div className="finance-controls">
        <div className="search-field">
          <Search size={16} /><input aria-label="Search financial providers" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search providers…" />
          {search && <button className="icon-button" aria-label="Clear provider search" onClick={() => setSearch("")}><X size={15} /></button>}
        </div>
        <select className="filter-select" aria-label="Filter financial records" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All providers</option><option value="review">Needs confirmation</option>
          <option value="balance">Has statement balance</option><option value="confirmed">Confirmed records</option>
        </select>
        <span className="finance-result-count" role="status">{visible.length} of {finance.rows.length} providers</span>
      </div>
      {visible.length > 0 && <p className="finance-table-hint">Swipe across the table for payments and balances.</p>}
      {visible.length > 0 ? <div className="finance-table-scroll" role="region" aria-label="Provider billing table" tabIndex={0}>
        <table className="finance-table">
          <thead><tr><th scope="col">Provider / statement</th><th scope="col">Billed</th><th scope="col">Insurance paid</th><th scope="col">Patient paid</th><th scope="col">Statement balance</th><th scope="col">Status</th></tr></thead>
          <tbody>{visible.map((row) => <Fragment key={row.id}>
            <tr className={expanded === row.id ? "is-expanded" : ""}>
              <th scope="row"><button className="finance-provider-button" onClick={() => setExpanded(expanded === row.id ? null : row.id)} aria-expanded={expanded === row.id} aria-controls={`finance-detail-${row.id}`}>
                <span className="finance-provider-icon"><ReceiptText size={17} /></span>
                <span><strong>{row.providerName}</strong><small>{displayDate(row.date)}</small></span>
                <ChevronDown className={expanded === row.id ? "rotate" : ""} size={15} />
              </button></th>
              {(["billed", "insurancePaid", "patientPaid", "outstanding"] as const).map((key) => <td key={key}><Amount value={row.amounts[key]} /></td>)}
              <td><Status value={row.status} /></td>
            </tr>
            <tr id={`finance-detail-${row.id}`} hidden={expanded !== row.id} className="finance-detail-row"><td colSpan={6}>
              {expanded === row.id && <div className="finance-detail">
                <div className="finance-detail-heading"><h3>{row.providerName} · Payment breakdown</h3><span>As of {displayDate(row.date || matter.asOf)}</span></div>
                <dl className="finance-detail-grid">{(Object.keys(amountLabels) as LedgerAmountKey[]).map((key) => <div key={key}><dt>{amountLabels[key]}</dt><dd><Amount value={row.amounts[key]} /></dd></div>)}</dl>
                <p className="finance-definition">Statement balance is the provider’s recorded unpaid balance. Patient balance is only the amount explicitly assigned to the patient. Denied or pending claims may still be under review.</p>
                {!!row.notes.length && <ul className="finance-record-notes">{row.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>}
                <div className="finance-source-label"><FileText size={13} />Supporting records</div>
                {row.sourceIds.length ? <RecordLinks ids={row.sourceIds} matter={matter} onSource={onSource} /> : <p className="finance-definition">No billing statement has been supplied for this provider.</p>}
              </div>}
            </td></tr>
          </Fragment>)}</tbody>
        </table>
      </div> : <div className="finance-empty">
        <span className="finance-empty-icon"><ReceiptText size={25} /></span>
        <h3>{finance.rows.length ? "No providers match these filters" : "No itemized billing records yet"}</h3>
        <p>{finance.rows.length ? "Try a different provider name or view all records." : "Provider statements can establish who was paid and what is still outstanding. Any existing financial summaries are shown below."}</p>
        {finance.rows.length
          ? <button className="button secondary" onClick={() => { setSearch(""); setFilter("all"); }}>Clear filters</button>
          : <button className="button secondary" onClick={onImport}>Import billing records <ArrowRight size={15} /></button>}
      </div>}
      <div className="finance-table-footer"><ShieldCheck size={14} /><span>All amounts in USD · {missingPaymentCount > 0 && <>“Not recorded” does not mean $0 · </>}Confirmed means explicitly confirmed in a source.</span></div>
      <span className="visually-hidden" role="status">{exported ? "Financial ledger exported as CSV." : ""}</span>
    </section>

    <div className="finance-bottom-grid">
      <section className="panel" aria-labelledby="insurance-followup-title">
        <div className="panel-heading"><div><h2 id="insurance-followup-title">Insurance & adjustments</h2><p>The details behind the remaining balance.</p></div><ShieldCheck size={20} className="finance-panel-icon" /></div>
        <div className="finance-insurance-list">
          {([
            ["outstanding", "Unpaid balance shown on provider statements."],
            ["insurancePending", "Submitted amounts still awaiting an insurer’s decision."],
            ["insuranceDenied", "Recorded denials; these may be disputed or appealed."],
            ["adjustments", "Recorded reductions and write-offs against charges."],
          ] as [LedgerAmountKey, string][]).map(([key, description]) => <div key={key}>
            <div><strong>{amountLabels[key]}</strong><p>{description}</p></div>
            <div className="finance-insurance-amount"><Amount value={finance.totals[key].amount} />
              {finance.totals[key].amount !== null && <small>{finance.totals[key].state === "partial" ? "Partial total" : "Recorded total"}</small>}
            </div>
          </div>)}
        </div>
        <div className="finance-section-note">These categories can overlap. Pending and denied amounts are not added to the statement balance.</div>
      </section>
      <section className="panel" aria-labelledby="other-finances-title">
        <div className="panel-heading"><div><h2 id="other-finances-title">Other financial records</h2><p>Case-level figures, shown separately from medical payments.</p></div><FileText size={20} className="finance-panel-icon" /></div>
        <div className="finance-context-list">
          {finance.facts.length ? finance.facts.map((fact) => <div key={fact.id}>
            <span className="finance-context-label">{fact.label}<span className="finance-context-certainty">{fact.certainty === "recorded" ? "Recorded" : fact.certainty === "unknown" ? "Not established" : "Unconfirmed"}</span></span>
            <p>{fact.value}</p><RecordLinks ids={fact.sourceIds} matter={matter} onSource={onSource} />
          </div>) : <p className="finance-context-empty">No additional financial figures are established in the available records.</p>}
        </div>
      </section>
    </div>
  </div>;
}
