import { createHash } from "node:crypto";
import type {
  Blocker,
  Fact,
  MatterSnapshot,
  Provider,
  SourceRecord,
  SourceType,
} from "../shared/types.ts";

type MatterMeta = Omit<
  MatterSnapshot,
  "sources" | "facts" | "blockers" | "events" | "providers" | "warnings"
>;
type Section = { name: string; start: number; end: number };
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const compact = (text: string) => text.replace(/\s+/g, " ").trim();
const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex").slice(0, 14);
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const dateOf = (text: string) => text.match(ISO_DATE)?.[0];
const normalized = (text: string) =>
  compact(text)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ");
const isEditorial = (line: string) =>
  /^(?:OBSERVATION:|NOTE(?: ON [^:]+)?:|\[NOTE:|\[\d+ further communications)/i.test(
    line.trim(),
  );

function validDate(value: string | undefined): value is string {
  return (
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

function sourceTitle(type: SourceType, lines: string[]): string {
  let title = lines[0]
    .replace(
      /^\s*(?:\[[^\]]+\]\s*)?\d{4}-\d{2}-\d{2}\s*(?:\d{2}:\d{2}[–-]\d{2}:\d{2}\s*)?(?:[—–-]\s*)?/,
      "",
    )
    .trim();
  if (type === "task" && /^By medical provider:/i.test(title)) {
    let i = 1;
    while (
      (!/[—–]/.test(title) || /[—–]\s*$/.test(title)) &&
      i < lines.length &&
      !/Assigned:/.test(lines[i])
    ) {
      title += " " + lines[i++].trim();
    }
  }
  if (type === "communication" && lines[1]) {
    const subject = lines[1].trim().split(/\s+[—–]\s+/)[0];
    title = `${subject} · ${title}`;
  }
  return compact(title) || `Imported ${type}`;
}

/** Parse a human-readable export. Line locators always refer to the unmodified input. */
export function parseTextExport(
  text: string,
  mode: "sample" | "import" = "import",
): MatterSnapshot {
  if (!text.trim()) throw new Error("The text export is empty.");
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^SECTION\s+\d+\s*[—–:-]\s*(.+)$/i);
    if (match) {
      if (sections.length) sections[sections.length - 1].end = i;
      sections.push({ name: match[1], start: i + 1, end: lines.length });
    }
  }
  const sources: SourceRecord[] = [];
  const providers: Provider[] = [];
  let clientName: string | undefined;
  const add = (
    type: SourceType,
    start: number,
    end: number,
    title?: string,
  ) => {
    while (
      start < end &&
      (!lines[start].trim() || /^=+$/.test(lines[start].trim()))
    )
      start++;
    while (
      end > start &&
      (!lines[end - 1].trim() || /^=+$/.test(lines[end - 1].trim()))
    )
      end--;
    if (end <= start) return;
    const raw = lines.slice(start, end).join("\n");
    const source: SourceRecord = {
      id: `source-${hash(`${type}:${start}:${raw}`)}`,
      type,
      title: title || sourceTitle(type, lines.slice(start, end)),
      text: raw,
      locator: `Text export · lines ${start + 1}–${end}`,
      ...(validDate(dateOf(lines[start]))
        ? { date: dateOf(lines[start]) }
        : {}),
    };
    sources.push(source);
    return source;
  };
  const paragraphs = (
    section: Section,
    consume: (start: number, end: number) => void,
  ) => {
    let start = section.start;
    for (let i = section.start; i <= section.end; i++) {
      if (
        i === section.end ||
        !lines[i].trim() ||
        /^=+$/.test(lines[i].trim())
      ) {
        if (start < i) consume(start, i);
        start = i + 1;
      }
    }
  };
  const readDated = (section: Section, type: SourceType) => {
    let start: number | undefined;
    let end: number | undefined;
    let editorial = false;
    const flush = () => {
      if (start !== undefined && end !== undefined) add(type, start, end);
      start = undefined;
      end = undefined;
    };
    for (let i = section.start; i < section.end; i++) {
      if (!lines[i].trim()) editorial = false;
      if (isEditorial(lines[i])) {
        flush();
        editorial = true;
        continue;
      }
      if (editorial) continue;
      if (/^\s*(?:\[[^\]]+\]\s*)?\d{4}-\d{2}-\d{2}\b/.test(lines[i])) {
        flush();
        start = i;
        end = i + 1;
      } else if (
        start !== undefined &&
        lines[i].trim() &&
        !/^=+$/.test(lines[i].trim())
      ) {
        // Uppercase subtotals and section labels are not part of the prior record.
        if (/^\s*(?:SUBTOTAL\b|[A-Z][A-Z /&]+\s*\()/.test(lines[i])) {
          flush();
          continue;
        }
        end = i + 1;
      }
    }
    flush();
  };
  for (const section of sections) {
    // These sections are commentary on the dataset, not original case evidence.
    if (
      /DERIVED|WHAT THIS FILE|INTERPRETATION|ANALYSIS|PRODUCT OBSERVATIONS/i.test(
        section.name,
      )
    )
      continue;
    if (/MATTER HEADER|MATTER DETAILS|FINANCIAL SUMMARY/i.test(section.name)) {
      for (let i = section.start; i < section.end; i++) {
        const key = lines[i].match(
          /^\s*([A-Za-z][A-Za-z /&.-]{1,55}):\s+(.+)$/,
        );
        if (!key) continue;
        let end = i + 1;
        while (
          end < section.end &&
          /^\s{4,}\S/.test(lines[end]) &&
          !/^\s*[A-Za-z][A-Za-z /&.-]{1,55}:\s+/.test(lines[end])
        )
          end++;
        add("field", i, end, key[1].trim());
        i = end - 1;
      }
    } else if (/CUSTOM FIELDS|CASE FIELDS/i.test(section.name)) {
      paragraphs(section, (start, end) => {
        if (!isEditorial(lines[start]))
          add("field", start, end, lines[start].trim().replace(/:$/, ""));
      });
    } else if (/CONTACTS|PROVIDERS/i.test(section.name)) {
      let group = /PROVIDERS/i.test(section.name) ? "MEDICAL PROVIDERS" : "";
      for (let i = section.start; i < section.end; i++) {
        if (/^[A-Z][A-Z /&]+(?:\s*\(.+\))?\s*$/.test(lines[i])) {
          group = lines[i];
          continue;
        }
        if (!/^\s{2}\S/.test(lines[i]) || !/[—–]/.test(lines[i])) continue;
        let end = i + 1;
        while (
          end < section.end &&
          lines[end].trim() &&
          !/^\s{2}\S/.test(lines[end])
        )
          end++;
        const name = lines[i].trim().split(/\s+[—–]\s+/)[0];
        add("contact", i, end, name);
        if (/^CLIENT\b/i.test(group)) clientName = name;
        if (/MEDICAL|TREATING|PROVIDERS/i.test(group))
          providers.push({ id: `provider-${hash(name)}`, name });
        i = end - 1;
      }
    } else if (/TASKS/i.test(section.name)) readDated(section, "task");
    else if (/CALENDAR|EVENTS/i.test(section.name))
      readDated(section, "calendar");
    else if (/EXPENSES|ACTIVITIES/i.test(section.name))
      readDated(section, "expense");
    else if (/COMMUNICATIONS/i.test(section.name))
      readDated(section, "communication");
    else if (/NOTES/i.test(section.name)) readDated(section, "note");
    else if (/DOCUMENTS/i.test(section.name)) {
      paragraphs(section, (start, end) => {
        if (!isEditorial(lines[start]))
          add("document", start, end, "Document inventory (metadata only)");
      });
    }
  }
  if (!sections.length) {
    paragraphs(
      { name: "Imported notes", start: 0, end: lines.length },
      (start, end) => add("note", start, end),
    );
  }
  if (!sources.length)
    throw new Error(
      "No case records were found. Use a text export with named sections or the documented JSON import format.",
    );
  const field = (...names: string[]) => {
    const source = sources.find(
      (s) =>
        s.type === "field" &&
        names.some((name) => normalized(s.title) === normalized(name)),
    );
    return source ? fieldValue(source) : undefined;
  };
  const exported = text.match(/^Export date:\s*(\d{4}-\d{2}-\d{2})/im)?.[1];
  const dates = sources
    .map((s) => s.date)
    .filter((d): d is string => validDate(d))
    .sort();
  const asOf = validDate(exported)
    ? exported
    : dates.at(-1) || new Date().toISOString().slice(0, 10);
  const number =
    field("Matter number", "Matter") ||
    `IMPORT-${hash(text).slice(0, 6).toUpperCase()}`;
  const description = field("Description") || "Imported matter";
  const result = digestMatter(
    {
      id: `${mode}-${slug(number)}`,
      number,
      clientName:
        clientName || field("Client", "Client name") || "Client not recorded",
      description,
      status: field("Status") || "Not recorded",
      stage: (field("Matter stage", "Stage") || "Not recorded").split(
        /\s*\(pipeline:/i,
      )[0],
      incidentDate: dateOf(field("Date of Incident", "Incident date") || ""),
      attorney: field("Responsible attorney", "Attorney"),
      sourceMode: mode,
      importedAt: new Date().toISOString(),
      asOf,
    },
    sources,
    providers,
  );
  if (!validDate(exported))
    result.warnings.push(
      "No export date was supplied. The latest dated record is used for the snapshot date; it may be a future event.",
    );
  if (/truncated in UI|Show more|further communications exist/i.test(text))
    result.warnings.push(
      "This export contains truncated fields and a partial communications history. Open the original Clio record to verify complete content.",
    );
  if (sources.some((s) => s.type === "document"))
    result.warnings.push(
      "Document inventory is metadata only. The underlying PDFs have not been read.",
    );
  return result;
}

function fieldValue(source: SourceRecord): string {
  const text = source.text.trim();
  const first = text.split("\n")[0];
  if (
    first.includes(":") &&
    normalized(first.split(":")[0]) === normalized(source.title)
  )
    return compact(text.slice(text.indexOf(":") + 1));
  if (normalized(first) === normalized(source.title) && text.includes("\n"))
    return compact(text.slice(text.indexOf("\n") + 1));
  return compact(text);
}

const providerWords = (provider: Provider) =>
  normalized(provider.name)
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 3 &&
        !/^(?:medical|medicine|physical|therapy|services|surgical|surgery|hospital|offices|center|centre|associates|rehabilitation|orthopaedic|orthopedic|chiropractic|pllc|new|york)$/.test(
          word,
        ),
    );
function providerFor(
  text: string,
  providers: Provider[],
): Provider | undefined {
  const value = normalized(text);
  return providers
    .map((provider) => ({
      provider,
      score: providerWords(provider).filter((word) =>
        new RegExp(`\\b${word}\\b`).test(value),
      ).length,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.provider;
}
function topicWords(text: string): string[] {
  const value = normalized(text);
  // Keep different kinds of requests to the same provider separate.
  if (/surg|arthroscop|scheduling/.test(value))
    return ["surgery", "surgical", "arthroscopy", "scheduling"];
  if (/employment|commission|wage/.test(value))
    return ["employment", "commission", "wage", "production"];
  if (/ledger|itemised|itemized|billing|cpt/.test(value))
    return ["ledger", "itemised", "itemized", "billing", "cpt"];
  if (/notes|records/.test(value)) return ["notes", "records", "treatment"];
  return value
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 5 &&
        ![
          "confirm",
          "updated",
          "obtain",
          "please",
          "pending",
          "assigned",
        ].includes(word),
    );
}
function isOutgoingRequest(source: SourceRecord, attorney?: string): boolean {
  if (
    !/request|chaser|chase|please (?:provide|advise|send|forward)|we (?:still )?need|following up|follow.up/i.test(
      source.text + " " + source.title,
    )
  )
    return false;
  const direction =
    source.text.match(/^\d{4}-\d{2}-\d{2}\s+([^>\n]+)>\s*([^\n]+)/m) ||
    source.title.match(/(?:^|·\s*)([^>·]+)>\s*([^>·]+)/);
  return (
    !!direction &&
    !!attorney &&
    normalized(direction[1]).includes(normalized(attorney))
  );
}
function digestTask(
  source: SourceRecord,
  meta: MatterMeta,
  sources: SourceRecord[],
  providers: Provider[],
): Blocker | undefined {
  if (
    /\bStatus:\s*(?:complete(?:d)?|done|cancelled|canceled)\b|\bCompleted:\s*true\b/i.test(
      source.text,
    )
  )
    return;
  const taskText = compact(source.text);
  const provider = providerFor(source.title + " " + taskText, providers);
  const topics = topicWords(source.title);
  const clientTask =
    /\b(?:from|with|to) (?:the )?client\b|employment|commission/i.test(
      source.title,
    );
  const candidates = sources.filter(
    (s) =>
      s.type === "communication" &&
      s.date &&
      s.date <= meta.asOf &&
      topics.some((word) =>
        normalized(s.text + " " + s.title).includes(word),
      ) &&
      (provider
        ? providerFor(s.title + " " + s.text, [provider])
        : clientTask
          ? normalized(s.text).includes(normalized(meta.clientName))
          : false),
  );
  const requests = candidates
    .filter((s) => isOutgoingRequest(s, meta.attorney))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const recent = [...candidates].sort((a, b) =>
    (b.date || "").localeCompare(a.date || b.date || ""),
  );
  const last = recent[0];
  const dueCandidate =
    source.text.match(/\bDue(?: date| at)?:\s*(\d{4}-\d{2}-\d{2})/i)?.[1] ||
    source.text.match(/^\s*(?:\[[^\]]+\]\s*)?(\d{4}-\d{2}-\d{2})\b/)?.[1];
  const dueAt = validDate(dueCandidate) ? dueCandidate : undefined;
  const dueDays =
    dueAt && validDate(meta.asOf)
      ? (Date.parse(dueAt) - Date.parse(meta.asOf)) / 86400000
      : undefined;
  const assigned = source.text
    .match(/Assigned(?: to)?:\s*([^|\n]+)/i)?.[1]
    .trim()
    .split(/\s*>\s*/)
    .at(-1);
  const owner =
    provider?.name ||
    (clientTask ? meta.clientName : assigned || "Owner not recorded");
  const combined = compact((last?.text || "") + " " + source.text);
  let status: Blocker["status"] = "needs_review";
  if (/not (?:been )?(?:asked|requested)|never requested/i.test(taskText))
    status = "not_requested";
  else if (
    /unavailable|cannot be (?:provided|obtained)|does not exist/i.test(taskText)
  )
    status = "unavailable";
  else if (
    last &&
    !isOutgoingRequest(last, meta.attorney) &&
    /no date|before scheduling|will follow|being prepared|partial|incomplete/i.test(
      last.text,
    )
  )
    status = "received_incomplete";
  else if (
    last &&
    !isOutgoingRequest(last, meta.attorney) &&
    /enclosed|attached|provided|completed|delivered/i.test(last.text)
  )
    status = "needs_review";
  else if (
    requests.length ||
    /unanswered|no response|awaiting|written requests|waiting for/i.test(
      combined,
    )
  )
    status = "awaiting_response";
  // Suggested actions describe review/follow-up only; no messages are sent.
  const nextAction =
    owner === "Owner not recorded"
      ? "Review the recorded task, identify an owner, and confirm the next step."
      : status === "received_incomplete"
        ? `Review the latest response from ${owner} and confirm the remaining information.`
        : status === "awaiting_response"
          ? `Follow up with ${owner} on this recorded request.`
          : status === "not_requested"
            ? `Review the missing item and prepare a request to ${owner}.`
            : `Review the recorded task with ${owner} and confirm the next step.`;
  const body = taskText
    .replace(/^(?:\[[^\]]+\]\s*)?\d{4}-\d{2}-\d{2}\s*[—–-]?\s*/, "")
    .replace(/\s*(?:Assigned(?: to)?|Status|Due(?: date| at)?):[\s\S]*$/i, "")
    .trim();
  const detail = body.startsWith(source.title)
    ? body.slice(source.title.length).trim()
    : body;
  return {
    id: `blocker-${source.id}`,
    title: source.title.replace(
      /^By medical provider:\s*[\s\S]+?\s+[—–]\s*/i,
      "",
    ),
    description: compact(detail || source.text).slice(0, 500),
    status,
    priority:
      dueDays !== undefined && dueDays < 0
        ? "high"
        : dueDays !== undefined && dueDays <= 7
          ? "medium"
          : "low",
    owner,
    ...(provider ? { providerId: provider.id } : {}),
    ...(requests[0]?.date ? { requestedAt: requests[0].date } : {}),
    ...(last?.date ? { lastActivityAt: last.date } : {}),
    ...(dueAt ? { dueAt } : {}),
    nextAction,
    sourceIds: [
      ...new Set([
        source.id,
        ...recent.slice(0, 3).map((s) => s.id),
        ...(requests[0] ? [requests[0].id] : []),
      ]),
    ],
  };
}

/** Derive an evidence-backed snapshot from any normalized matter, including Clio. */
export function digestMatter(
  meta: MatterMeta,
  sources: SourceRecord[],
  providers: Provider[] = [],
): MatterSnapshot {
  const facts: Fact[] = [];
  const categories: [RegExp, Fact["category"]][] = [
    [
      /insurance|coverage|policy limits|claim number|no.fault|um\/uim/i,
      "coverage",
    ],
    [
      /treatment status|medical status|discharg|maximum medical improvement|mmi/i,
      "treatment",
    ],
    [
      /\blien\b|medical specials|wage loss|work in progress|unbilled|outstanding balance|trust funds|^expenses$/i,
      "financial",
    ],
    [
      /date of incident|incident date|accident location|hipaa authorization/i,
      "matter",
    ],
  ];
  for (const source of sources) {
    if (
      source.type !== "field" ||
      /estimated case value|valuation|case value rationale|settlement/i.test(
        source.title,
      )
    )
      continue;
    // Lien-bearing fields belong to financial even when their label mentions insurance.
    const category = /\blien\b/i.test(source.title)
      ? "financial"
      : categories.find(([pattern]) => pattern.test(source.title))?.[1];
    if (!category) continue;
    const value = fieldValue(source);
    const missing =
      !value ||
      /^(?:—|-|unknown|not recorded|not provided|null|n\/a)$/i.test(value);
    facts.push({
      id: `fact-${source.id}`,
      label: source.title,
      value: missing ? "Not recorded in this field" : value,
      category,
      certainty: missing ? "unknown" : "recorded",
      sourceIds: [source.id],
    });
  }
  const fallbacks: {
    category: Fact["category"];
    label: string;
    match: RegExp;
  }[] = [
    {
      category: "coverage",
      label: "Recorded coverage update",
      match:
        /coverage (?:confirmed|confirmation)|policy limits|no.fault.*exhaust/i,
    },
    {
      category: "treatment",
      label: "Recorded treatment update",
      match:
        /treatment status|treatment (?:ongoing|complete)|discharged|surgery.*(?:date|scheduled)/i,
    },
    {
      category: "financial",
      label: "Recorded lien update",
      match: /\blien\b.*\$|\$.*\blien\b/i,
    },
  ];
  for (const fallback of fallbacks) {
    if (
      facts.some(
        (f) =>
          f.category === fallback.category &&
          (fallback.category !== "financial" || /\blien\b/i.test(f.label)),
      )
    )
      continue;
    const source = sources
      .filter(
        (s) =>
          ["note", "communication"].includes(s.type) &&
          fallback.match.test(s.title + " " + s.text),
      )
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
    if (source)
      facts.push({
        id: `fact-${fallback.category}-${source.id}`,
        category: fallback.category,
        label: fallback.label,
        value: `See source: ${source.title}`,
        certainty: "recorded",
        sourceIds: [source.id],
      });
    else
      facts.push({
        id: `unknown-${fallback.category}`,
        category: fallback.category,
        label:
          fallback.category === "financial"
            ? "Liens / recorded financial position"
            : fallback.category === "coverage"
              ? "Coverage"
              : "Treatment status",
        value:
          "Not identified in the imported records. Review the complete matter before treating this as missing.",
        certainty: "unknown",
        sourceIds: [],
      });
  }
  const blockers = sources
    .filter((s) => s.type === "task")
    .map((s) => digestTask(s, meta, sources, providers))
    .filter((b): b is Blocker => !!b)
    .sort(
      (a, b) =>
        ({ high: 0, medium: 1, low: 2 })[a.priority] -
          { high: 0, medium: 1, low: 2 }[b.priority] ||
        (a.dueAt || "9999").localeCompare(b.dueAt || "9999"),
    );
  const events = sources
    .filter(
      (s) =>
        ["note", "communication", "calendar"].includes(s.type) &&
        validDate(s.date),
    )
    .map((s) => ({
      id: `event-${s.id}`,
      title: s.title,
      date: s.date!,
      category: s.type,
      sourceIds: [s.id],
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const warnings = [
    "Priorities use recorded task due dates at the snapshot date. Next actions and linked correspondence are rule-based suggestions for attorney review.",
    "Recorded amounts and statements are source assertions, not verified balances, settlement predictions, or legal conclusions.",
  ];
  if (!blockers.length)
    warnings.push(
      "No open tasks were identified. This does not establish that the matter has no blockers.",
    );
  return { ...meta, sources, providers, facts, blockers, events, warnings };
}
