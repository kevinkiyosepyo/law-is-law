import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import { readFileSync } from "node:fs";
import { Store } from "../server/store.ts";
import { createApp } from "../server/app.ts";
import { parseTextExport } from "../server/digest.ts";

test("attorney APIs require session; provider bearer scope, CSRF guard and revocation hold over HTTP", async () => {
  const store = new Store(":memory:");
  const matter = parseTextExport(
    readFileSync(
      new URL("../fixtures/example-case.txt", import.meta.url),
      "utf8",
    ),
    "sample",
  );
  store.saveMatter(matter);
  const options = {
    bootstrapToken: "local-test-bootstrap-secret",
    origin: "http://127.0.0.1:0",
  };
  const app = createApp(store, options);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  options.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (path: string, init: RequestInit = {}) =>
    fetch(options.origin + path, init);
  try {
    assert.equal((await request("/api/matters")).status, 401);
    assert.equal(
      (await request(`/api/matters/${matter.id}/shares`)).status,
      401,
    );
    const login = await request("/api/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: options.origin },
      body: JSON.stringify({ token: options.bootstrapToken }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.match(login.headers.get("set-cookie")!, /HttpOnly/);
    const headers = {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: options.origin,
    };
    assert.equal(
      (
        await request("/api/bootstrap", {
          method: "POST",
          headers,
          body: JSON.stringify({ token: options.bootstrapToken }),
        })
      ).status,
      401,
      "Bootstrap is one-time",
    );
    const snapshot = await (
      await request(`/api/matters/${matter.id}`, { headers })
    ).json();
    assert.equal(snapshot.clientName, matter.clientName);
    const provider = matter.providers[0];
    const chosen = matter.facts[0];
    const create = await request(`/api/matters/${matter.id}/shares`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        providerId: provider.id,
        factIds: [chosen.id],
        blockerIds: [],
        includeSources: false,
      }),
    });
    assert.equal(create.status, 201);
    const { share, url } = await create.json();
    const providerPath = "/api" + new URL(url).pathname;
    const providerResponse = await request(providerPath);
    assert.equal(providerResponse.status, 200);
    assert.equal(providerResponse.headers.get("cache-control"), "no-store");
    const view = await providerResponse.json();
    assert.equal(view.items.length, 1);
    assert.equal(view.items[0].value, chosen.value);
    assert.deepEqual(view.items[0].sources, []);
    assert.equal(view.sources, undefined);
    assert.equal(view.blockers, undefined);
    assert.equal(view.facts, undefined);
    assert.equal(
      (
        await request(`/api/matters/${matter.id}`, {
          headers: { Authorization: `Bearer ${url.split("/").at(-1)}` },
        })
      ).status,
      401,
      "Provider link cannot authorize attorney endpoints",
    );
    assert.equal(
      (
        await request(`/api/shares/${share.id}`, {
          method: "DELETE",
          headers: { ...headers, Origin: "https://attacker.example" },
        })
      ).status,
      403,
    );
    const badHostStatus = await new Promise<number | undefined>(
      (resolve, reject) => {
        const req = httpRequest(
          options.origin + "/api/matters",
          { headers: { ...headers, Host: "attacker.example" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        );
        req.on("error", reject);
        req.end();
      },
    );
    assert.equal(badHostStatus, 403, "Reject DNS rebinding host");
    assert.equal(
      (await request(`/api/shares/${share.id}`, { method: "DELETE", headers }))
        .status,
      200,
    );
    assert.equal((await request(providerPath)).status, 404);
    assert.equal(
      (await request("/api/clio/callback?state=bad&code=bogus", { headers }))
        .status,
      400,
    );
    assert.equal(
      (
        await request("/api/import", {
          method: "POST",
          headers,
          body: "{invalid",
        })
      ).status,
      400,
    );
    const status = await (
      await request("/api/clio/status", { headers })
    ).json();
    assert.equal("clientSecret" in status || "accessToken" in status, false);
    await request("/api/logout", { method: "POST", headers });
    assert.equal((await request("/api/matters", { headers })).status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    store.close();
  }
});
