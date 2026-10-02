import { createHash } from "node:crypto";
import { digestMatter, parseTextExport } from "./digest.ts";
import type {
  MatterSnapshot,
  Provider,
  SourceRecord,
  SourceType,
} from "../shared/types.ts";

export const importTemplate = {
  matter: {
    id: "example-001",
    number: "EX-001",
    clientName: "Jordan Example",
    description: "Illustrative personal-injury matter",
    status: "Open",
    stage: "Treatment",
    asOf: "2026-10-02",
    attorney: "Assigned attorney",
  },
  providers: [{ id: "example-pt", name: "Example Physical Therapy" }],
  sources: [
    {
      id: "task-1",
      type: "task",
      title: "Obtain updated records from Example Physical Therapy",
      date: "2026-09-28",
      text: "Updated treatment notes requested from Example Physical Therapy. Status: Pending\nAssigned: Assigned attorney\nDue: 2026-10-05",
      locator: "Example task 1",
    },
    {
      id: "communication-1",
      type: "communication",
      title: "Assigned attorney > Example Physical Therapy",
      date: "2026-09-28",
      text: "Please provide the updated treatment records for Jordan Example.",
      locator: "Example communication 1",
    },
    {
      id: "field-1",
      type: "field",
      title: "Treatment Status",
      text: "Ongoing physical therapy; progress notes requested.",
      locator: "Example matter field",
    },
  ],
};
const sourceTypes = new Set<SourceType>([
  "note",
  "communication",
  "task",
  "calendar",
  "document",
  "field",
  "expense",
  "contact",
]);
const str = (value: unknown, max = 1000): string =>
  typeof value === "string" ? value.slice(0, max) : "";
const object = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const date = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !==
      value.slice(0, 10)
  )
    throw new Error("Dates must be valid ISO dates, such as 2026-10-02.");
  return value.slice(0, 10);
};
export function importMatter(
  text: string,
  filename = "import",
): MatterSnapshot {
  if (!text.trim()) throw new Error("Choose a non-empty case export.");
  if (text.length > 6_000_000)
    throw new Error("This draft supports text or JSON exports up to 6 MB.");
  if (!text.trimStart().startsWith("{")) return parseTextExport(text, "import");
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("The JSON export could not be read. Check its syntax.");
  }
  if (
    !object(input) ||
    !object(input.matter) ||
    !Array.isArray(input.sources) ||
    !input.sources.length
  )
    throw new Error(
      "Use the import template: a matter object and a non-empty sources array. An analyzed summary alone is not a source export.",
    );
  if (input.sources.length > 10000)
    throw new Error("Import at most 10,000 source records per matter.");
  const ids = new Set<string>();
  const sources: SourceRecord[] = input.sources.map((s: any, i: number) => {
    if (
      !s ||
      !sourceTypes.has(s.type) ||
      typeof s.text !== "string" ||
      !s.text.trim()
    )
      throw new Error(
        `Source ${i + 1} needs a supported type and original text.`,
      );
    if (s.text.length > 100000)
      throw new Error(
        `Source ${i + 1} exceeds the 100,000 character limit. Split the original into smaller records with their own locators.`,
      );
    const id = str(s.id, 200) || `source-${i + 1}`;
    if (ids.has(id)) throw new Error(`Duplicate source ID: ${id}`);
    ids.add(id);
    let url: string | undefined;
    if (s.url) {
      try {
        const u = new URL(s.url);
        if (u.protocol === "https:") url = u.toString();
      } catch {
        /* omit untrusted malformed URL */
      }
    }
    return {
      id,
      type: s.type,
      title: str(s.title) || `Source ${i + 1}`,
      text: s.text,
      date: date(s.date),
      locator: str(s.locator) || `${filename} · sources[${i}]`,
      url,
    };
  });
  const providers: Provider[] = Array.isArray(input.providers)
    ? input.providers
        .slice(0, 500)
        .map((p: any) => ({ id: str(p?.id, 200), name: str(p?.name) }))
        .filter((p: Provider) => p.id && p.name)
    : [];
  if (new Set(providers.map((p) => p.id)).size !== providers.length)
    throw new Error("Provider IDs must be unique.");
  const m = input.matter;
  const number = str(m.number) || str(m.id) || "Imported matter";
  const now = new Date().toISOString();
  return digestMatter(
    {
      id: `import-${createHash("sha256")
        .update(str(m.id) || number)
        .digest("hex")
        .slice(0, 16)}`,
      number,
      clientName: str(m.clientName) || "Client not recorded",
      description: str(m.description),
      status: str(m.status) || "Unknown",
      stage: str(m.stage) || "Unknown",
      sourceMode: "import",
      importedAt: now,
      asOf: date(m.asOf) || now.slice(0, 10),
      incidentDate: date(m.incidentDate),
      attorney: str(m.attorney) || undefined,
    },
    sources,
    providers,
  );
}
