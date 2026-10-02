import type { Fact, MatterSnapshot, Provider, SourceRecord } from "./types.ts";

export type LedgerAmountKey =
  | "billed"
  | "insurancePaid"
  | "patientPaid"
  | "adjustments"
  | "outstanding"
  | "patientResponsibility"
  | "insurancePending"
  | "insuranceDenied";

export interface FinanceLedgerRow {
  id: string;
  providerId?: string;
  providerName: string;
  date?: string;
  status: "confirmed" | "recorded" | "pending" | "disputed" | "unknown";
  /** Integer cents; null means the record did not establish this amount. */
  amounts: Record<LedgerAmountKey, number | null>;
  sourceIds: string[];
  notes: string[];
}

export interface FinanceAmountTotal {
  amount: number | null;
  knownCount: number;
  totalCount: number;
  confirmedCount: number;
  state: "recorded" | "partial" | "unknown";
}

export interface MatterFinances {
  rows: FinanceLedgerRow[];
  totals: Record<LedgerAmountKey, FinanceAmountTotal>;
  facts: Fact[];
}

interface BillingCandidate extends FinanceLedgerRow {
  kind: "snapshot" | "bill";
  conflictingKeys: Set<LedgerAmountKey>;
}

export const ledgerAmountKeys: LedgerAmountKey[] = [
  "billed", "insurancePaid", "patientPaid", "adjustments", "outstanding",
  "patientResponsibility", "insurancePending", "insuranceDenied",
];

const labels: Record<string, LedgerAmountKey> = {
  billed: "billed",
  "total billed": "billed",
  charges: "billed",
  "medical charges": "billed",
  "insurance paid": "insurancePaid",
  "patient paid": "patientPaid",
  adjustments: "adjustments",
  "contractual adjustments": "adjustments",
  "outstanding balance": "outstanding",
  "patient responsibility": "patientResponsibility",
  "remaining patient responsibility": "patientResponsibility",
  "insurance pending": "insurancePending",
  "insurance denied": "insuranceDenied",
};

const blankAmounts = (): FinanceLedgerRow["amounts"] => ({
  billed: null, insurancePaid: null, patientPaid: null, adjustments: null,
  outstanding: null, patientResponsibility: null,
  insurancePending: null, insuranceDenied: null,
});

const normalize = (value: string) => value.toLowerCase()
  .replace(/\bpm\s*&\s*r\b/g, "physical medicine rehabilitation")
  .replace(/\([^)]*\)/g, " ")
  .replace(/\b(?:m\.?d\.?|p\.?c\.?|pllc|llc|inc)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

/** Strict parsing prevents an estimate/range or policy narrative becoming a payment. */
function cents(value: string): number | null {
  const match = value.trim().match(/^(?:USD\s*)?\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, "")) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

function dateOf(source: SourceRecord): string | undefined {
  const value = source.date || source.text.match(/^\s*(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return undefined;
  const day = value.slice(0, 10);
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day ? undefined : day;
}

function matchProvider(name: string, providers: Provider[]): Provider | undefined {
  const candidate = normalize(name);
  const exact = providers.filter((provider) => normalize(provider.name) === candidate);
  if (exact.length === 1) return exact[0];
  // Exported charge lines often omit a provider's corporate suffix or specialty.
  // Require an unambiguous prefix of at least two words, never a shared specialty alone.
  const matches = providers.filter((provider) => {
    const registered = normalize(provider.name);
    const shorter = candidate.length < registered.length ? candidate : registered;
    return shorter.split(" ").length >= 2 &&
      (candidate.startsWith(`${registered} `) || registered.startsWith(`${candidate} `));
  });
  return matches.length === 1 ? matches[0] : undefined;
}

const isFirmExpense = (value: string) =>
  /firm (?:case )?expenses|court filing|filing (?:fee|expense)|records (?:reproduction|copying|fee)|reproduction (?:cost|fee)|observer (?:attendance|cost|fee)|(?:paid|advanced) by (?:the )?firm|attorney(?:'s)? fees/i.test(value);

function makeRow(name: string, source: SourceRecord, providers: Provider[]): BillingCandidate {
  const provider = matchProvider(name, providers);
  return {
    id: provider ? `finance-${provider.id}` : `finance-provider-${normalize(name).replace(/ /g, "-")}`,
    providerId: provider?.id,
    providerName: provider?.name || name.trim(),
    date: dateOf(source),
    status: "recorded",
    amounts: blankAmounts(),
    sourceIds: [source.id],
    notes: [],
    kind: "snapshot",
    conflictingKeys: new Set(),
  };
}

function structuredRows(source: SourceRecord, providers: Provider[]): BillingCandidate[] {
  const providerLines = [...source.text.matchAll(/^\s*Provider:\s*(.+)$/gim)];
  const rows: BillingCandidate[] = [];
  for (let index = 0; index < providerLines.length; index++) {
    const match = providerLines[index];
    const block = source.text.slice(match.index, providerLines[index + 1]?.index);
    const row = makeRow(match[1], source, providers);
    let recognized = false;
    const seen = new Set<LedgerAmountKey>();
    for (const line of block.split(/\r?\n/)) {
      const field = line.match(/^\s*([A-Za-z ]+):\s*(.*?)\s*$/);
      if (!field) continue;
      const label = field[1].toLowerCase().trim();
      const key = labels[label];
      if (key) {
        recognized = true;
        const amount = cents(field[2]);
        // Two inconsistent values within a source are not a reliable balance.
        if (seen.has(key) && row.amounts[key] !== amount) {
          row.amounts[key] = null;
          row.status = "disputed";
          row.conflictingKeys.add(key);
          row.notes.push(`Conflicting ${label} values in this record.`);
        } else if (!seen.has(key)) row.amounts[key] = amount;
        seen.add(key);
      } else if (label === "account note" && field[2]) {
        row.notes.push(field[2]);
      } else if (label === "status" && row.status !== "disputed") {
        const status = field[2].toLowerCase();
        if (["confirmed", "recorded", "pending", "disputed", "unknown"].includes(status)) {
          row.status = status as FinanceLedgerRow["status"];
        }
      }
    }
    if (recognized) {
      row.notes.push("Provider totals as recorded in the latest billing snapshot. Missing fields remain unknown.");
      rows.push(row);
    }
  }
  return rows;
}

function expenseRow(source: SourceRecord, providers: Provider[]): BillingCandidate | undefined {
  // Only an original expense with one provider and one explicitly stated charge
  // is accepted. Narrative tallies, document inventories and policy fields are excluded.
  if (source.type !== "expense") return undefined;
  const firstLine = source.text.trim().split(/\r?\n/)[0]
    .replace(/^\d{4}-\d{2}-\d{2}\s*(?:[—–-]\s*)?/, "");
  const match = firstLine.match(/^(.+?)\s+(\$\d[\d,]*(?:\.\d{1,2})?)\s*$/);
  if (!match || !matchProvider(match[1], providers)) return undefined;
  const amount = cents(match[2]);
  if (amount === null) return undefined;
  const row = makeRow(match[1], source, providers);
  row.kind = "bill";
  row.amounts.billed = amount;
  row.notes.push("Recorded treatment charges. Payments, adjustments and the patient's remaining balance are not established by this bill.");
  return row;
}

/**
 * Derive medical finances from original provider bills and explicit billing
 * snapshots. Cumulative snapshots are selected by date, never added together.
 * No payment or patient liability is inferred from charges, limits or liens.
 */
export function deriveFinances(matter: MatterSnapshot): MatterFinances {
  const currentSources = matter.sources.filter((source) => {
    const date = dateOf(source);
    return !date || date <= matter.asOf.slice(0, 10);
  });
  const groups = new Map<string, BillingCandidate[]>();
  for (const source of currentSources) {
    if (!["expense", "note"].includes(source.type) || isFirmExpense(`${source.title}\n${source.text}`)) continue;
    const explicit = structuredRows(source, matter.providers);
    const bill = explicit.length ? undefined : expenseRow(source, matter.providers);
    for (const row of explicit.length ? explicit : bill ? [bill] : []) {
      const group = groups.get(row.id) || [];
      group.push(row);
      groups.set(row.id, group);
    }
  }

  const rows: FinanceLedgerRow[] = [];
  for (const candidates of groups.values()) {
    const sorted = [...candidates].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const newest = sorted[0];
    const atLatestDate = sorted.filter((row) => row.date === newest.date);
    // An explicit cumulative statement can replace individual charge records.
    const latestSnapshots = atLatestDate.filter((row) => row.kind === "snapshot");
    const sameDate = latestSnapshots.length ? latestSnapshots : atLatestDate;
    const { kind: _kind, conflictingKeys: _conflicts, ...latestRow } = sameDate[0];
    const row: FinanceLedgerRow = {
      ...latestRow,
      amounts: { ...latestRow.amounts },
      sourceIds: [...new Set(sameDate.flatMap((item) => item.sourceIds))],
      notes: [...new Set(sameDate.flatMap((item) => item.notes))],
    };
    // Same-date conflicting statements are visible as disputed, with no guessed value.
    for (const key of ledgerAmountKeys) {
      const values = new Set(sameDate.map((item) => item.amounts[key]).filter((value): value is number => value !== null));
      if (values.size > 1 || sameDate.some((item) => item.conflictingKeys.has(key))) {
        row.amounts[key] = null;
        row.status = "disputed";
        row.notes.push("Conflicting snapshots on the same date need reconciliation; conflicting amounts are shown as unknown.");
      } else row.amounts[key] = values.size ? [...values][0] : null;
    }
    if (sameDate.some((item) => item.status === "disputed")) row.status = "disputed";
    else if (row.status !== "disputed" && sameDate.some((item) => item.status === "pending")) row.status = "pending";
    else if (row.status !== "disputed") {
      row.status = sameDate.every((item) => item.status === "confirmed") ? "confirmed"
        : sameDate.every((item) => item.status === "unknown") ? "unknown" : "recorded";
    }
    const rawBills = sorted.filter((item) => item.kind === "bill");
    const billTexts = new Set(rawBills.flatMap((item) => item.sourceIds.map((id) => currentSources.find((source) => source.id === id)?.text.trim())));
    if (!latestSnapshots.length && (billTexts.size > 1 || sorted.some((item) => item.kind === "snapshot"))) {
      row.amounts.billed = null;
      row.status = "disputed";
      row.sourceIds = [...new Set(sorted.flatMap((item) => item.sourceIds))];
      row.notes.push("Several bills or a charge newer than the latest statement need reconciliation. A single charge does not establish the provider's cumulative billed total.");
    }
    const { billed, insurancePaid, patientPaid, adjustments, outstanding, patientResponsibility } = row.amounts;
    if (billed !== null && insurancePaid !== null && patientPaid !== null && adjustments !== null && outstanding !== null) {
      const accounted = insurancePaid + patientPaid + adjustments + outstanding;
      if (!Number.isSafeInteger(accounted) || billed !== accounted) {
        row.status = "disputed";
        row.notes.push("The recorded charges do not equal payments, adjustments, and the statement balance. Review the source before relying on these figures.");
      }
    }
    if (patientResponsibility !== null && outstanding !== null && patientResponsibility > outstanding) {
      row.status = "disputed";
      row.notes.push("Recorded patient responsibility exceeds the statement balance. The source amounts need reconciliation.");
    }
    if (sorted.length > sameDate.length) row.notes.push("Other billing records are available in Evidence; they are not added to this provider total.");
    row.notes = [...new Set(row.notes)];
    rows.push(row);
  }
  for (const provider of matter.providers) {
    if (rows.some((row) => row.providerId === provider.id)) continue;
    rows.push({
      id: `finance-${provider.id}`, providerId: provider.id, providerName: provider.name,
      status: "unknown", amounts: blankAmounts(), sourceIds: [],
      notes: ["No itemized billing or payment record supplied for this provider."],
    });
  }
  rows.sort((a, b) => (b.amounts.billed ?? -1) - (a.amounts.billed ?? -1) || a.providerName.localeCompare(b.providerName));

  const totals = {} as MatterFinances["totals"];
  for (const key of ledgerAmountKeys) {
    const known = rows.filter((row) => row.amounts[key] !== null);
    const sum = known.reduce((total, row) => total + row.amounts[key]!, 0);
    const amount = known.length && Number.isSafeInteger(sum) ? sum : null;
    totals[key] = {
      amount, knownCount: known.length, totalCount: rows.length,
      confirmedCount: known.filter((row) => row.status === "confirmed").length,
      state: amount === null ? "unknown" : known.length === rows.length ? "recorded" : "partial",
    };
  }
  const usableIds = new Set(currentSources.filter((source) => source.type !== "document").map((source) => source.id));
  const facts = matter.facts.filter((fact) => fact.category === "financial" &&
    fact.sourceIds.length > 0 && fact.sourceIds.every((id) => usableIds.has(id)));
  return { rows, totals, facts };
}
