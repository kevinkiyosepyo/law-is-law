import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  authorizationUrl,
  ClioReadOnlyClient,
  configureTokenStore,
  exchangeCode,
  getClioStatus,
  importClioMatters,
  type TokenSet,
} from "../server/clio.js";

const originalFetch = globalThis.fetch;
const envKeys = [
  "CLIO_CLIENT_ID",
  "CLIO_CLIENT_SECRET",
  "CLIO_ACCESS_TOKEN",
  "CLIO_REGION",
  "CLIO_REDIRECT_URI",
] as const;
const originalEnv = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]]),
);
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys)
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  configureTokenStore({ get: () => null, save: () => {} });
});
const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
function client(
  fetcher: typeof fetch,
  options: Partial<ConstructorParameters<typeof ClioReadOnlyClient>[0]> = {},
) {
  return new ClioReadOnlyClient({
    origin: "https://app.clio.com",
    getToken: async () => "test-access-token",
    fetcher,
    ...options,
  });
}
function setEnv() {
  process.env.CLIO_CLIENT_ID = "test-client";
  process.env.CLIO_CLIENT_SECRET = "test-secret";
  process.env.CLIO_REGION = "US";
  delete process.env.CLIO_REDIRECT_URI;
  delete process.env.CLIO_ACCESS_TOKEN;
}

test("OAuth selects a fixed regional host and carries state without client secret", () => {
  setEnv();
  process.env.CLIO_REGION = "CA";
  const url = new URL(authorizationUrl("session-state"));
  assert.equal(url.origin, "https://ca.app.clio.com");
  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("state"), "session-state");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "http://127.0.0.1:4310/api/clio/callback",
  );
  assert.equal(url.searchParams.has("client_secret"), false);
  process.env.CLIO_REGION = "https://attacker.invalid";
  assert.throws(() => authorizationUrl("state"), /CLIO_REGION/);
});

test("OAuth exchanges code only at the token endpoint with redirects disabled", async () => {
  setEnv();
  let saved: TokenSet | null = null;
  configureTokenStore({
    get: () => saved,
    save: (token) => {
      saved = token;
    },
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://app.clio.com/oauth/token");
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "manual");
    assert.equal(
      new URLSearchParams(String(init?.body)).get("grant_type"),
      "authorization_code",
    );
    return json({
      access_token: "new-test-token",
      refresh_token: "refresh-test-token",
      expires_in: 3600,
    });
  };
  await exchangeCode("test-code");
  assert.equal(saved!.accessToken, "new-test-token");
  assert.equal(saved!.region, "US");
  const status = getClioStatus();
  assert.equal(status.connected, true);
  assert.doesNotMatch(
    JSON.stringify(status),
    /new-test-token|test-secret|refresh-test-token/,
  );
});

test("OAuth failures never disclose response body or follow redirects", async () => {
  setEnv();
  globalThis.fetch = async () =>
    json({ access_token: "secret-response-body" }, 302, {
      Location: "https://attacker.invalid",
    });
  await assert.rejects(
    exchangeCode("code"),
    (error) =>
      error instanceof Error &&
      /HTTP 302/.test(error.message) &&
      !error.message.includes("secret-response-body"),
  );
});

test("read-only client rejects all write verbs before token access or network", async () => {
  let calls = 0;
  const api = client(
    async () => {
      calls++;
      return json({});
    },
    {
      getToken: async () => {
        calls++;
        return "token";
      },
    },
  );
  for (const method of ["POST", "PUT", "PATCH", "DELETE"])
    await assert.rejects(
      api.get("/api/v4/matters.json", method),
      /writes are disabled/,
    );
  assert.equal(calls, 0);
});

test("resource GET uses authorization header and disables redirects", async () => {
  const api = client(async (input, init) => {
    assert.equal(new URL(String(input)).origin, "https://app.clio.com");
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "manual");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-access-token",
    );
    return json({ data: [] });
  });
  await api.get("/api/v4/matters.json");
});

test("tokens cannot be forwarded to untrusted URLs, credentials, or write paths", async () => {
  let calls = 0;
  const api = client(async () => {
    calls++;
    return json({});
  });
  for (const url of [
    "https://attacker.invalid/api/v4/matters.json",
    "https://app.clio.com.evil.invalid/api/v4/matters.json",
    "https://user:pass@app.clio.com/api/v4/matters.json",
    "https://app.clio.com/oauth/token",
    "/api/v4/documents/1/download.json",
    "/api/v4/matters.json?_method=DELETE",
  ]) {
    await assert.rejects(api.get(url));
  }
  assert.equal(calls, 0);
});

test("same-origin redirects are also refused before any second fetch", async () => {
  let calls = 0;
  const api = client(async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { Location: "https://app.clio.com/oauth/token" },
    });
  });
  await assert.rejects(api.get("/api/v4/matters.json"), /redirect was blocked/);
  assert.equal(calls, 1);
});

test("pagination follows safe cursors and preserves the matter filter", async () => {
  let calls = 0;
  const api = client(async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("matter_id"), "123");
    calls++;
    return calls === 1
      ? json({
          data: [{ id: 1 }],
          meta: {
            paging: {
              next: "https://app.clio.com/api/v4/notes.json?matter_id=123&page_token=next",
            },
          },
        })
      : json({ data: [{ id: 2 }] });
  });
  assert.deepEqual(
    (await api.list("notes", "id,detail", { matter_id: "123" })).records.map(
      (row) => row.id,
    ),
    [1, 2],
  );
});

test("pagination rejects host, resource, or matter substitution", async () => {
  for (const next of [
    "https://attacker.invalid/api/v4/notes.json?matter_id=123",
    "/api/v4/contacts.json?matter_id=123",
    "/api/v4/notes.json?matter_id=999",
    "/api/v4/notes.json?page_token=next",
  ]) {
    let calls = 0;
    const api = client(async () => {
      calls++;
      return json({ data: [{ id: 1 }], meta: { paging: { next } } });
    });
    await assert.rejects(api.list("notes", "id", { matter_id: "123" }));
    assert.equal(calls, 1);
  }
});

test("bounded import identifies truncation and repeated pagination", async () => {
  const api = client(async () =>
    json({
      data: [{ id: 1 }, { id: 2 }],
      meta: { paging: { next: "/api/v4/notes.json?page_token=next" } },
    }),
  );
  const result = await api.list("notes", "id", {}, 1);
  assert.equal(result.records.length, 1);
  assert.match(result.warnings.join(" "), /incomplete/);
  const repeated = client(async (input) =>
    json({ data: [{ id: 1 }], meta: { paging: { next: String(input) } } }),
  );
  assert.match(
    (await repeated.list("notes", "id")).warnings.join(" "),
    /pagination repeated/,
  );
});

test("field fallback is explicit and only follows an HTTP 400", async () => {
  let calls = 0;
  const api = client(async (input) => {
    calls++;
    return new URL(String(input)).searchParams.get("fields") === "id,bad_field"
      ? json({}, 400)
      : json({ data: [{ id: 1 }] });
  });
  const result = await api.list("notes", "id,bad_field", {}, 1000, "id");
  assert.equal(calls, 2);
  assert.match(result.warnings.join(" "), /reduced field set/);
});

test("rate-limit retry honors Retry-After and stops after bounded attempts", async () => {
  let clock = 100_000,
    calls = 0;
  const slept: number[] = [];
  const api = client(
    async () => {
      calls++;
      return calls === 1
        ? json({}, 429, { "Retry-After": "2" })
        : json({ data: [] });
    },
    {
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    },
  );
  await api.get("/api/v4/notes.json");
  assert.deepEqual(slept, [2000]);
  assert.equal(calls, 2);
});

test("401 performs exactly one token refresh before retrying", async () => {
  const refreshes: boolean[] = [];
  let calls = 0;
  const api = client(
    async () => (++calls === 1 ? json({}, 401) : json({ data: [] })),
    {
      getToken: async (refresh) => {
        refreshes.push(Boolean(refresh));
        return "token";
      },
    },
  );
  await api.get("/api/v4/notes.json");
  assert.deepEqual(refreshes, [false, true]);
});

test("full import is read-only and clearly reports inaccessible data and document limitations", async () => {
  setEnv();
  process.env.CLIO_ACCESS_TOKEN = "local-test-token";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.method, "GET");
    if (url.pathname === "/api/v4/matters.json")
      return json({
        data: [
          {
            id: 10,
            display_number: "TEST-10",
            description: "Test matter",
            status: "Open",
            client: { id: 20, name: "Test Client" },
            custom_field_values: [
              { id: "text-3", field_name: "Policy Limits", value: "Unknown" },
            ],
          },
        ],
      });
    if (url.pathname === "/api/v4/tasks.json")
      return json({
        data: [
          {
            id: 30,
            name: "Request records",
            description: "Records requested from provider",
            status: "pending",
            due_at: "2026-10-10",
            updated_at: "2026-10-02",
          },
        ],
      });
    if (url.pathname === "/api/v4/notes.json") return json({}, 403);
    if (url.pathname === "/api/v4/documents.json")
      return json({ data: [{ id: 40, name: "medical-record.pdf" }] });
    if (url.pathname === "/api/v4/contacts/20.json")
      return json({ data: { id: 20, name: "Test Client", type: "Person" } });
    return json({ data: [] });
  };
  const result = await importClioMatters();
  assert.equal(result.matters.length, 1);
  assert.equal(result.matters[0].sourceMode, "clio");
  assert.match(result.matters[0].id, /^clio-/);
  assert.match(result.matters[0].warnings.join(" "), /HTTP 403/);
  assert.match(result.matters[0].warnings.join(" "), /metadata only/i);
  assert.match(
    result.matters[0].sources.find((source) => source.type === "document")!
      .text,
    /have not been retrieved or read/,
  );
});

test("live API normalization identifies provider requests, dates, overdue tasks, and expense types", async () => {
  setEnv();
  process.env.CLIO_ACCESS_TOKEN = "local-test-token";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.method, "GET");
    if (url.pathname === "/api/v4/matters.json") {
      assert.doesNotMatch(url.searchParams.get("fields")!, /related_contacts/);
      return json({
        data: [
          {
            id: 11,
            display_number: "TEST-11",
            status: "Open",
            client: { id: 21, name: "Test Client" },
            responsible_attorney: { id: 1, name: "Alex Attorney" },
            custom_field_values: [],
          },
        ],
      });
    }
    if (url.pathname === "/api/v4/tasks.json") {
      assert.doesNotMatch(url.searchParams.get("fields")!, /\bcomplete\b/);
      return json({
        data: [
          {
            id: 31,
            name: "Request Hudson medical records",
            description: "Awaiting medical records from Hudson Hospital",
            status: "pending",
            due_at: "2020-01-15",
            updated_at: "2020-01-10T12:30:00Z",
          },
        ],
      });
    }
    if (url.pathname === "/api/v4/communications.json")
      return json({
        data: [
          {
            id: 51,
            subject: "Hudson records request",
            body: "Please send Hudson Hospital treatment records.",
            date: "2020-01-09",
            received_at: "2020-01-09T20:30:00Z",
            senders: [{ id: 1, name: "Alex Attorney" }],
            receivers: [{ id: 25, name: "Hudson Hospital" }],
          },
        ],
      });
    if (url.pathname === "/api/v4/calendar_entries.json")
      return json({
        data: [
          {
            id: "61",
            summary: "Provider call",
            start_at: "2020-01-12T01:30:00Z",
            start_date: "2020-01-11",
          },
        ],
      });
    if (url.pathname === "/api/v4/activities.json")
      return json({
        data: [
          {
            id: 71,
            type: "ExpenseEntry",
            note: "Record reproduction",
            total: 25,
            date: "2020-01-10",
          },
        ],
      });
    if (url.pathname === "/api/v4/matters/11/related_contacts.json")
      return json({
        data: [
          {
            id: 25,
            name: "Hudson Hospital",
            type: "Company",
            relationship: { id: 91, description: "Medical provider" },
          },
        ],
      });
    return json({ data: [] });
  };
  const matter = (await importClioMatters()).matters[0];
  assert.match(matter.asOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(matter.providers[0].name, "Hudson Hospital");
  assert.equal(matter.blockers[0].priority, "high");
  assert.equal(matter.blockers[0].requestedAt, "2020-01-09");
  assert.equal(matter.blockers[0].status, "awaiting_response");
  assert.ok(matter.blockers[0].sourceIds.includes("clio-communications-51"));
  assert.equal(matter.events.length, 2);
  assert.equal(
    matter.events.find((event) => event.category === "calendar")!.date,
    "2020-01-11",
  );
  assert.equal(
    matter.sources.find((source) => source.id === "clio-activities-71")!.type,
    "expense",
  );
});

test("nested related-contact pagination cannot switch matters", async () => {
  let calls = 0;
  const api = client(async () => {
    calls++;
    return json({
      data: [{ id: 1 }],
      meta: {
        paging: {
          next: "/api/v4/matters/999/related_contacts.json?page_token=next",
        },
      },
    });
  });
  await assert.rejects(
    api.list("matters/123/related_contacts", "id,name"),
    /changed the requested resource/,
  );
  assert.equal(calls, 1);
});
