import type {
  ClioStatus,
  MatterSnapshot,
  Provider,
  SourceRecord,
  SourceType,
} from "../shared/types.js";
import { digestMatter } from "./digest.js";

// Clio Manage, not Clio Platform/Grow. Resource access is structurally GET-only.
// Reference: https://docs.developers.clio.com/api-docs/clio-manage/authorization/
const REGIONS = {
  US: "https://app.clio.com",
  CA: "https://ca.app.clio.com",
  EU: "https://eu.app.clio.com",
  AU: "https://au.app.clio.com",
} as const;
type Region = keyof typeof REGIONS;
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  region: string;
}
interface TokenStore {
  get(): TokenSet | null;
  save(token: TokenSet): void;
}
let tokenStore: TokenStore = {
  get: () => null,
  save: () => {
    throw new Error("Clio token storage is not configured.");
  },
};
export function configureTokenStore(store: TokenStore) {
  tokenStore = store;
}

function config() {
  const region = (process.env.CLIO_REGION || "US").toUpperCase();
  if (!Object.hasOwn(REGIONS, region))
    throw new Error("CLIO_REGION must be US, CA, EU, or AU.");
  return {
    region: region as Region,
    origin: REGIONS[region as Region],
    clientId: process.env.CLIO_CLIENT_ID || "",
    clientSecret: process.env.CLIO_CLIENT_SECRET || "",
    redirectUri:
      process.env.CLIO_REDIRECT_URI ||
      "http://127.0.0.1:4310/api/clio/callback",
  };
}

function currentToken(): TokenSet | null {
  const cfg = config();
  const stored = tokenStore.get();
  if (stored && stored.region !== cfg.region)
    throw new Error(
      "Saved Clio authorization belongs to a different region. Reconnect Clio.",
    );
  return (
    stored ||
    (process.env.CLIO_ACCESS_TOKEN
      ? { accessToken: process.env.CLIO_ACCESS_TOKEN, region: cfg.region }
      : null)
  );
}

export function getClioStatus(): ClioStatus {
  try {
    const cfg = config();
    const token = currentToken();
    const missing = [
      ["CLIO_CLIENT_ID", cfg.clientId],
      ["CLIO_CLIENT_SECRET", cfg.clientSecret],
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);
    const expired = Boolean(
      token?.expiresAt && token.expiresAt <= Date.now() && !token.refreshToken,
    );
    return {
      configured: missing.length === 0 || Boolean(token),
      connected: Boolean(token) && !expired,
      region: cfg.region,
      missing: token ? [] : missing,
      message: expired
        ? "Clio token expired. Reconnect to refresh case data."
        : token
          ? "Authorization is available. Sync to verify access and import case records."
          : missing.length
            ? "Add your Clio application credentials to connect. The sample workspace is available now."
            : "Ready to authorize your Clio account with read-only access.",
    };
  } catch (error) {
    return {
      configured: false,
      connected: false,
      region: "",
      missing: ["CLIO_REGION"],
      message: safeError(error),
    };
  }
}

export function authorizationUrl(state: string): string {
  const cfg = config();
  if (!cfg.clientId || !cfg.clientSecret)
    throw new Error(
      "Set CLIO_CLIENT_ID and CLIO_CLIENT_SECRET before connecting.",
    );
  if (!state) throw new Error("OAuth state is required.");
  const url = new URL("/oauth/authorize", cfg.origin);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    state,
    redirect_on_decline: "true",
  }).toString();
  return url.toString();
}

async function tokenRequest(
  parameters: Record<string, string>,
  priorRefreshToken?: string,
) {
  const cfg = config();
  if (!cfg.clientId || !cfg.clientSecret)
    throw new Error(
      "Clio application credentials are required for authorization or token refresh.",
    );
  let response: Response;
  try {
    response = await fetch(new URL("/oauth/token", cfg.origin), {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        ...parameters,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error(
      "Clio authorization request failed or timed out. Please retry.",
    );
  }
  if (!response.ok)
    throw new Error(
      `Clio authorization failed (HTTP ${response.status}). Verify application settings and reconnect.`,
    );
  let result: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  try {
    result = await response.json();
  } catch {
    throw new Error("Clio returned an invalid authorization response.");
  }
  if (!result.access_token || typeof result.access_token !== "string")
    throw new Error("Clio returned an invalid authorization response.");
  const token: TokenSet = {
    accessToken: result.access_token,
    refreshToken: result.refresh_token || priorRefreshToken,
    expiresAt:
      typeof result.expires_in === "number"
        ? Date.now() + result.expires_in * 1000
        : undefined,
    region: cfg.region,
  };
  tokenStore.save(token);
  return token;
}

// State must be checked against the user's HTTP session by the callback route.
export async function exchangeCode(code: string): Promise<void> {
  if (!code) throw new Error("Clio did not return an authorization code.");
  await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: config().redirectUri,
  });
}

let refreshInFlight: Promise<TokenSet> | undefined;
async function accessToken(forceRefresh = false): Promise<string> {
  let token = currentToken();
  if (!token) throw new Error("Connect Clio before syncing.");
  if (
    forceRefresh ||
    (token.expiresAt && token.expiresAt < Date.now() + 30_000)
  ) {
    if (!token.refreshToken)
      throw new Error("Clio authorization expired. Reconnect Clio.");
    refreshInFlight ||= tokenRequest(
      { grant_type: "refresh_token", refresh_token: token.refreshToken },
      token.refreshToken,
    ).finally(() => {
      refreshInFlight = undefined;
    });
    token = await refreshInFlight;
  }
  return token.accessToken;
}

class ClioError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
function safeError(error: unknown): string {
  return error instanceof ClioError ||
    (error instanceof Error &&
      /^(Clio|CLIO_|Saved Clio|Connect Clio|Set CLIO_)/.test(error.message))
    ? error.message
    : "Clio data could not be retrieved.";
}
type Row = Record<string, any>;
interface ListResult {
  records: Row[];
  warnings: string[];
}
const RESOURCES = new Set([
  "matters",
  "tasks",
  "notes",
  "communications",
  "calendar_entries",
  "activities",
  "documents",
  "contacts",
]);
const relatedContactsResource = (resource: string) =>
  /^matters\/[0-9]+\/related_contacts$/.test(resource);

/** Exported for security tests. There is intentionally no resource write method. */
export class ClioReadOnlyClient {
  private requests: number[] = [];
  private nextAllowedAt = 0;
  constructor(
    private readonly options: {
      origin: string;
      getToken: (refresh?: boolean) => Promise<string>;
      fetcher?: typeof fetch;
      sleep?: (ms: number) => Promise<void>;
      now?: () => number;
    },
  ) {
    if (!Object.values(REGIONS).includes(options.origin as typeof REGIONS.US))
      throw new ClioError("Clio origin must match a supported region.");
  }
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  private sleep(ms: number) {
    return (
      this.options.sleep?.(ms) ??
      new Promise<void>((resolve) => setTimeout(resolve, ms))
    );
  }
  private validate(url: URL) {
    if (
      url.origin !== this.options.origin ||
      url.username ||
      url.password ||
      url.hash ||
      !/^\/api\/v4\/(?:[a-z_]+(?:\/[0-9]+)?|matters\/[0-9]+\/related_contacts)(?:\.json)?$/.test(
        url.pathname,
      )
    )
      throw new ClioError(
        "Clio returned an unsafe resource or pagination URL.",
      );
    if (!RESOURCES.has(url.pathname.split("/")[3].replace(/\.json$/, "")))
      throw new ClioError("Clio resource is not enabled for this import.");
    if (
      [...url.searchParams.keys()].some((key) =>
        /^(access_token|token|authorization|_method|method)$/i.test(key),
      )
    )
      throw new ClioError(
        "Clio returned an unsafe resource or pagination parameter.",
      );
  }
  async get(input: string | URL, method = "GET"): Promise<Row> {
    if (method !== "GET")
      throw new ClioError("Clio resource writes are disabled.");
    const url = new URL(input, this.options.origin);
    this.validate(url);
    let refreshed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.requests = this.requests.filter(
        (time) => time > this.now() - 60_000,
      );
      const delay = Math.max(
        0,
        this.nextAllowedAt - this.now(),
        this.requests.length >= 40 ? this.requests[0] + 60_000 - this.now() : 0,
      );
      if (delay > 60_000)
        throw new ClioError(
          "Clio rate limit requires a longer wait. Retry sync later.",
          429,
        );
      if (delay) await this.sleep(delay);
      const token = await this.options.getToken(refreshed);
      refreshed = false;
      let response: Response;
      try {
        this.requests.push(this.now());
        response = await (this.options.fetcher || fetch)(url, {
          method: "GET",
          redirect: "manual",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new ClioError(
          "Clio request failed or timed out. Retry sync later.",
        );
      }
      const remaining = response.headers.get("X-RateLimit-Remaining");
      const reset = Number(response.headers.get("X-RateLimit-Reset")) * 1000;
      if (remaining !== null && Number(remaining) <= 1 && reset > this.now())
        this.nextAllowedAt = reset;
      if (response.status === 401 && attempt === 0) {
        refreshed = true;
        continue;
      }
      if (response.status === 429 && attempt < 2) {
        const value = response.headers.get("Retry-After");
        const seconds =
          value && /^\d+(\.\d+)?$/.test(value)
            ? Number(value)
            : value
              ? (Date.parse(value) - this.now()) / 1000
              : 2;
        const retryMs = Number.isFinite(seconds)
          ? Math.max(0, seconds * 1000)
          : 2000;
        if (retryMs > 60_000)
          throw new ClioError(
            "Clio rate limit requires a longer wait. Retry sync later.",
            429,
          );
        this.nextAllowedAt = Math.max(this.nextAllowedAt, this.now() + retryMs);
        continue;
      }
      if (response.status >= 300 && response.status < 400)
        throw new ClioError(
          "Clio redirected a resource request; redirect was blocked to protect credentials.",
          response.status,
        );
      if (!response.ok)
        throw new ClioError(
          `Clio returned HTTP ${response.status}${response.status === 403 ? "; check read permissions for this resource" : ""}.`,
          response.status,
        );
      try {
        return (await response.json()) as Row;
      } catch {
        throw new ClioError("Clio returned an invalid JSON response.");
      }
    }
    throw new ClioError("Clio request could not finish. Retry sync later.");
  }
  async list(
    resource: string,
    fields: string,
    filters: Record<string, string> = {},
    limit = 1000,
    fallbackFields?: string,
  ): Promise<ListResult> {
    if (!RESOURCES.has(resource) && !relatedContactsResource(resource))
      throw new ClioError("Clio resource is not enabled for this import.");
    const first = new URL(`/api/v4/${resource}.json`, this.options.origin);
    // CalendarEntries does not advertise an order filter; follow its cursor as returned.
    first.search = new URLSearchParams({
      limit: String(Math.min(limit, 200)),
      ...(resource === "calendar_entries" || relatedContactsResource(resource)
        ? {}
        : { order: "id(asc)" }),
      fields,
      ...filters,
    }).toString();
    const records: Row[] = [],
      warnings: string[] = [],
      seen = new Set<string>();
    let url: URL | undefined = first;
    while (url && records.length < limit) {
      this.validate(url);
      if (
        url.pathname.replace(/\.json$/, "") !==
        first.pathname.replace(/\.json$/, "")
      )
        throw new ClioError("Clio pagination changed the requested resource.");
      for (const [key, value] of Object.entries(filters))
        if (url.searchParams.get(key) !== value)
          throw new ClioError(
            "Clio pagination changed the requested matter or contact filter.",
          );
      if (seen.has(url.href)) {
        warnings.push(
          `${resource}: pagination repeated; imported records are incomplete.`,
        );
        break;
      }
      seen.add(url.href);
      let result: Row;
      try {
        result = await this.get(url);
      } catch (error) {
        if (
          error instanceof ClioError &&
          error.status === 400 &&
          fallbackFields &&
          records.length === 0
        ) {
          warnings.push(
            `${resource}: some requested fields were unavailable; imported a reduced field set.`,
          );
          url.searchParams.set("fields", fallbackFields);
          fallbackFields = undefined;
          result = await this.get(url);
        } else throw error;
      }
      if (!Array.isArray(result.data))
        throw new ClioError(
          `Clio returned an unexpected ${resource} response.`,
        );
      records.push(...result.data.slice(0, limit - records.length));
      const next = result.meta?.paging?.next;
      url =
        typeof next === "string" && next
          ? new URL(next, this.options.origin)
          : undefined;
      if ((url && records.length >= limit) || result.data.length > limit)
        warnings.push(
          `${resource}: reached the ${limit}-record import limit; this snapshot is incomplete.`,
        );
    }
    return { records, warnings };
  }
}

function text(value: unknown): string {
  return value == null
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}
function plain(value: unknown): string {
  return text(value)
    .replace(/<(?:br\s*\/|br|\/p|\/div)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}
function names(value: unknown): string {
  return Array.isArray(value)
    ? value
        .map((item) => text(item.name || item.first_name || item.id))
        .join(", ")
    : "";
}
function day(value: unknown): string | undefined {
  const candidate = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) &&
    !Number.isNaN(Date.parse(candidate)) &&
    new Date(candidate).toISOString().slice(0, 10) === candidate
    ? candidate
    : undefined;
}
function source(
  row: Row,
  type: SourceType,
  title: string,
  body: string,
  resource: string,
  matterId: string,
  date?: string,
): SourceRecord {
  return {
    id: `clio-${resource}-${row.id}`,
    type,
    title: title || `${type} ${row.id}`,
    text: body,
    date: day(date || row.date || row.updated_at || row.created_at),
    locator: `Clio ${resource} #${row.id} · matter #${matterId}`,
    url: new URL(
      `/api/v4/${resource}/${row.id}.json`,
      config().origin,
    ).toString(),
  };
}

export async function importClioMatters(): Promise<{
  matters: MatterSnapshot[];
  warnings: string[];
}> {
  const cfg = config();
  await accessToken();
  const api = new ClioReadOnlyClient({
    origin: cfg.origin,
    getToken: accessToken,
  });
  const warnings: string[] = [];
  const listed = await api.list(
    "matters",
    "id,display_number,description,status,updated_at,client{id,name},responsible_attorney{id,name},matter_stage{id,name},custom_field_values{id,field_name,field_type,value,picklist_option}",
    {},
    10,
    "id,display_number,description,status,client{id,name},custom_field_values{id,field_name,field_type,value}",
  );
  warnings.push(...listed.warnings);
  const matters: MatterSnapshot[] = [];
  for (const matter of listed.records) {
    if (!/^\d+$/.test(text(matter.id))) {
      warnings.push(
        "A matter was skipped because Clio did not return a usable record ID.",
      );
      continue;
    }
    const matterId = text(matter.id),
      filters = { matter_id: matterId },
      sources: SourceRecord[] = [],
      providers: Provider[] = [];
    const matterWarnings = [
      "Document metadata only: document contents and scans have not been downloaded or analyzed.",
    ];
    const fetchRows = async (
      resource: string,
      fields: string,
      query: Record<string, string> = filters,
      fallback?: string,
    ) => {
      try {
        const result = await api.list(resource, fields, query, 1000, fallback);
        matterWarnings.push(...result.warnings);
        return result.records;
      } catch (error) {
        matterWarnings.push(
          `${resource}: ${safeError(error)} These records were not fully imported.`,
        );
        return [];
      }
    };
    sources.push(
      source(
        matter,
        "field",
        "Matter overview",
        `Matter: ${text(matter.display_number)}\nClient: ${text(matter.client?.name) || "Not returned"}\nDescription: ${plain(matter.description)}\nStatus: ${text(matter.status)}\nStage: ${text(matter.matter_stage?.name) || "Not recorded"}`,
        "matters",
        matterId,
      ),
    );
    for (const field of Array.isArray(matter.custom_field_values)
      ? matter.custom_field_values
      : []) {
      const label = text(field.field_name) || "Unnamed custom field";
      const value =
        field.picklist_option?.option ??
        (/^(picklist|matter|contact)$/.test(field.field_type) &&
        field.value != null
          ? `Unresolved ${field.field_type} reference #${text(field.value)}`
          : field.value);
      if (text(value).startsWith("Unresolved "))
        matterWarnings.push(
          `${label}: the reference label was not returned; review the original field in Clio.`,
        );
      sources.push({
        id: `clio-field-${matterId}-${text(field.id) || label}`,
        type: "field",
        title: label,
        text: `${label}: ${text(value) || "Not recorded"}`,
        locator: `Clio matter #${matterId} · custom field ${label}`,
      });
    }
    if (!Array.isArray(matter.custom_field_values))
      matterWarnings.push(
        "Custom field values were not returned; coverage and financial fields may be incomplete.",
      );
    const tasks = await fetchRows(
      "tasks",
      "id,name,description,status,due_at,updated_at,created_at,assignee{id,name}",
      filters,
      "id,name,description,status,due_at,updated_at",
    );
    tasks.forEach((row) =>
      sources.push(
        source(
          row,
          "task",
          plain(row.name),
          `${plain(row.description)}\nStatus: ${text(row.status) || (row.complete ? "Complete" : "Unknown")}\nAssigned: ${text(row.assignee?.name) || "Not recorded"}\nDue: ${text(row.due_at) || "Not recorded"}`,
          "tasks",
          matterId,
        ),
      ),
    );
    const notes = await fetchRows(
      "notes",
      "id,subject,detail,date,updated_at",
      filters,
    );
    notes.forEach((row) =>
      sources.push(
        source(
          row,
          "note",
          plain(row.subject),
          plain(row.detail),
          "notes",
          matterId,
        ),
      ),
    );
    const communications = await fetchRows(
      "communications",
      "id,subject,body,date,received_at,updated_at,senders{id,name},receivers{id,name}",
      filters,
      "id,subject,body,date,updated_at",
    );
    communications.forEach((row) =>
      sources.push(
        source(
          row,
          "communication",
          plain(row.subject),
          `${day(row.date || row.received_at) || "Date not returned"}  ${names(row.senders) || "Sender not returned"} > ${names(row.receivers) || "Recipient not returned"}\n${plain(row.body)}`,
          "communications",
          matterId,
          row.date || row.received_at,
        ),
      ),
    );
    const entries = await fetchRows(
      "calendar_entries",
      "id,summary,description,start_at,start_date,end_at,updated_at",
      filters,
    );
    entries.forEach((row) =>
      sources.push(
        source(
          row,
          "calendar",
          plain(row.summary),
          `${plain(row.description)}\nStarts: ${text(row.start_at)}\nEnds: ${text(row.end_at)}`,
          "calendar_entries",
          matterId,
          row.start_date || row.start_at,
        ),
      ),
    );
    const activities = await fetchRows(
      "activities",
      "id,type,note,date,price,quantity,total,non_billable,updated_at",
      filters,
    );
    activities.forEach((row) =>
      sources.push(
        source(
          row,
          /^(ExpenseEntry|HardCostEntry|SoftCostEntry)$/.test(row.type)
            ? "expense"
            : "note",
          plain(row.note) || text(row.type),
          `Activity type: ${text(row.type)}\n${plain(row.note)}\nRecorded total: ${text(row.total) || "Not returned"}\nPrice: ${text(row.price)}\nQuantity: ${text(row.quantity)}\nNon-billable: ${text(row.non_billable)}\nActivity entries are not verified medical bills or settlement deductions.`,
          "activities",
          matterId,
        ),
      ),
    );
    const documents = await fetchRows(
      "documents",
      "id,name,created_at,updated_at",
      filters,
    );
    documents.forEach((row) =>
      sources.push(
        source(
          row,
          "document",
          plain(row.name),
          `Document listed in Clio: ${plain(row.name)}. Metadata only; contents have not been retrieved or read.`,
          "documents",
          matterId,
        ),
      ),
    );
    // Related contacts are a nested endpoint, not a field on Matter.
    // https://docs.developers.clio.com/guides/clio-manage/matters/#related-contacts
    const related = await fetchRows(
      `matters/${matterId}/related_contacts`,
      "id,name,type,is_matter_client,relationship{id,description}",
      {},
    );
    for (const row of related) {
      const role = text(row.relationship?.description);
      sources.push(
        source(
          row,
          "contact",
          text(row.name),
          `Name: ${text(row.name)}\nRelationship: ${role || "Not returned"}\nContact type: ${text(row.type)}`,
          "contacts",
          matterId,
        ),
      );
      if (
        /provider|treating|medical|hospital|physician/i.test(role) &&
        row.name
      )
        providers.push({ id: `clio-contact-${row.id}`, name: text(row.name) });
    }
    if (!providers.length)
      matterWarnings.push(
        "No medical providers were reliably identified from contact relationships.",
      );
    const now = new Date().toISOString();
    const snapshot = digestMatter(
      {
        id: `clio-matter-${matterId}`,
        number: text(matter.display_number) || matterId,
        clientName: text(matter.client?.name) || "Client not returned",
        description: plain(matter.description),
        status: text(matter.status) || "Unknown",
        stage: text(matter.matter_stage?.name) || "Stage not recorded",
        attorney: text(matter.responsible_attorney?.name) || undefined,
        sourceMode: "clio",
        importedAt: now,
        asOf: now.slice(0, 10),
      },
      sources,
      providers,
    );
    snapshot.warnings.push(...matterWarnings);
    matters.push(snapshot);
  }
  return { matters, warnings };
}
