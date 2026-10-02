import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import express from "express";
import { Store } from "./store.ts";
import { createApp } from "./app.ts";
import { loadSample } from "./sample.ts";

if (existsSync(".env")) loadEnvFile(".env");
const port = Number(process.env.PORT || 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("PORT must be between 1024 and 65535.");
const origin = `http://127.0.0.1:${port}`;
const store = new Store(resolve(".data/dashboard.sqlite"));
if (!store.listMatters().some((m) => m.sourceMode === "sample"))
  store.saveMatter(await loadSample());
const bootstrapToken = randomBytes(32).toString("base64url");
mkdirSync(".data", { recursive: true, mode: 0o700 });
writeFileSync(
  ".data/preview-access.json",
  JSON.stringify({ url: `${origin}/#access=${bootstrapToken}` }),
  { mode: 0o600 },
);
const app = createApp(store, {
  bootstrapToken,
  origin,
  // Shared local-demo default; use APP_PASSWORD for private case data.
  password: process.env.APP_PASSWORD || "123",
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: { port: port + 1, host: "127.0.0.1" },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.listen(port, "127.0.0.1", () => {
  console.log(`Dashboard Ultra Pro Max is running at ${origin}`);
  console.log(`Private local access link: ${origin}/#access=${bootstrapToken}`);
  console.log(
    "Clio records stay read-only. Cached case data lives in .data/dashboard.sqlite.",
  );
});
