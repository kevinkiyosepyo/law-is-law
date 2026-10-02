import express from "express";
import type { Request, Response, NextFunction } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Store, hash } from "./store.ts";
import { importMatter, importTemplate } from "./import.ts";
import {
  configureTokenStore,
  getClioStatus,
  authorizationUrl,
  exchangeCode,
  importClioMatters,
} from "./clio.ts";

function cookies(req: Request) {
  return Object.fromEntries(
    (req.headers.cookie || "").split(";").map((c) => c.trim().split("=")),
  );
}
export function createApp(
  store: Store,
  options: { bootstrapToken: string; origin: string; password?: string },
) {
  const app = express();
  app.disable("x-powered-by");
  const sessions = new Map<string, number>();
  const loginAttempts = new Map<string, { count: number; until: number }>();
  let bootstrapHash = hash(options.bootstrapToken);
  const states = new Map<string, { expires: number; session: string }>();
  let refreshing = false;
  configureTokenStore({
    get: () => store.getSetting("clio-tokens"),
    save: (tokens) => store.setSetting("clio-tokens", tokens),
  });
  const sessionId = (req: Request) => cookies(req).ultra_session || "";
  const authenticated = (req: Request) =>
    (sessions.get(hash(sessionId(req))) || 0) > Date.now();
  const establishSession = (res: Response) => {
    const token = randomBytes(32).toString("base64url");
    sessions.set(hash(token), Date.now() + 12 * 3600000);
    res.cookie("ultra_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: options.origin.startsWith("https:"),
      maxAge: 12 * 3600000,
      path: "/",
    });
  };
  app.use((req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    const expectedHost = new URL(options.origin).host;
    if (
      req.headers.host !== expectedHost &&
      req.headers.host !== expectedHost.replace("127.0.0.1", "localhost")
    ) {
      res
        .status(403)
        .json({ error: "This local app only accepts its configured host." });
      return;
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== options.origin &&
      req.headers.origin !== options.origin.replace("127.0.0.1", "localhost")
    ) {
      res.status(403).json({ error: "Request origin is not allowed." });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "7mb" }));
  app.get("/api/session", (req, res) => {
    res.json({
      authenticated: authenticated(req),
      passwordConfigured: Boolean(options.password),
    });
  });
  app.post("/api/bootstrap", (req, res) => {
    if (
      !bootstrapHash ||
      typeof req.body?.token !== "string" ||
      hash(req.body.token) !== bootstrapHash
    ) {
      res
        .status(401)
        .json({
          error:
            "This local access link has expired or was already used. Restart the app for a new link, or use the configured password.",
        });
      return;
    }
    bootstrapHash = "";
    establishSession(res);
    res.json({ ok: true });
  });
  app.post("/api/login", (req, res) => {
    const address = req.ip || "local";
    let entry = loginAttempts.get(address);
    if (!entry || entry.until < Date.now()) {
      entry = { count: 0, until: Date.now() + 60000 };
      loginAttempts.set(address, entry);
    }
    if (++entry.count > 10) {
      res
        .status(429)
        .json({ error: "Too many attempts. Try again in one minute." });
      return;
    }
    if (!options.password) {
      res
        .status(401)
        .json({
          error:
            "Use the private access link printed in your local terminal. Set APP_PASSWORD in .env to enable password sign-in.",
        });
      return;
    }
    const entered = hash(
      typeof req.body?.password === "string" ? req.body.password : "",
    );
    if (
      !timingSafeEqual(
        Buffer.from(entered),
        Buffer.from(hash(options.password)),
      )
    ) {
      res.status(401).json({ error: "Password not recognized." });
      return;
    }
    establishSession(res);
    res.json({ ok: true });
  });
  app.post("/api/logout", (req, res) => {
    sessions.delete(hash(sessionId(req)));
    res.clearCookie("ultra_session");
    res.json({ ok: true });
  });
  app.get("/api/provider/:token", (req, res) => {
    const share = store.getProviderShare(String(req.params.token));
    if (!share) {
      res
        .status(404)
        .json({
          error: "This provider link is unavailable, expired, or revoked.",
        });
      return;
    }
    res.json(share);
  });
  app.get("/api/clio/callback", async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const entry = states.get(state);
    states.delete(state);
    if (
      !entry ||
      entry.expires < Date.now() ||
      entry.session !== hash(sessionId(req)) ||
      !authenticated(req)
    ) {
      res
        .status(400)
        .send(
          "Clio authorization expired. Return to the app and connect again.",
        );
      return;
    }
    if (req.query.error || typeof req.query.code !== "string") {
      res.redirect("/?clio=cancelled");
      return;
    }
    try {
      await exchangeCode(req.query.code);
      res.redirect("/?clio=connected");
    } catch {
      res.redirect("/?clio=failed");
    }
  });
  app.use("/api", (req, res, next) => {
    if (!authenticated(req)) {
      res.status(401).json({ error: "Attorney sign-in required." });
      return;
    }
    next();
  });
  app.get("/api/matters", (_req, res) =>
    res.json({ matters: store.listMatters() }),
  );
  app.get("/api/matters/:id", (req, res) => {
    const matter = store.getMatter(String(req.params.id));
    if (!matter) {
      res.status(404).json({ error: "Matter not found." });
      return;
    }
    res.json(matter);
  });
  app.get("/api/matters/:id/shares", (req, res) =>
    res.json({ shares: store.listShares(String(req.params.id)) }),
  );
  app.post("/api/matters/:id/shares", (req, res) => {
    const m = store.getMatter(String(req.params.id));
    if (!m) {
      res.status(404).json({ error: "Matter not found." });
      return;
    }
    const b = req.body;
    if (
      !b ||
      typeof b.providerId !== "string" ||
      !Array.isArray(b.factIds) ||
      !Array.isArray(b.blockerIds) ||
      ![...b.factIds, ...b.blockerIds].every((id) => typeof id === "string") ||
      typeof b.includeSources !== "boolean"
    ) {
      res
        .status(400)
        .json({ error: "Choose a provider and the items to approve." });
      return;
    }
    try {
      const { share, token } = store.createShare(m, b);
      res
        .status(201)
        .json({ share, url: `${options.origin}/provider/${token}` });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
  app.delete("/api/shares/:id", (req, res) => {
    if (!store.revokeShare(String(req.params.id))) {
      res.status(404).json({ error: "Share not found." });
      return;
    }
    res.json({ ok: true });
  });
  app.get("/api/import-template", (_req, res) => {
    res.attachment("matter-import-example.json");
    res.json(importTemplate);
  });
  app.post("/api/import", (req, res) => {
    if (typeof req.body?.text !== "string") {
      res.status(400).json({ error: "A text or JSON export is required." });
      return;
    }
    try {
      const matter = importMatter(
        req.body.text,
        typeof req.body.filename === "string" ? req.body.filename : "import",
      );
      store.saveMatter(matter);
      res.status(201).json(matter);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
  app.get("/api/clio/status", (_req, res) =>
    res.json({
      ...getClioStatus(),
      lastSync: store.getSetting<string>("last-clio-sync") || undefined,
    }),
  );
  app.get("/api/clio/connect", (req, res) => {
    try {
      const state = randomBytes(24).toString("base64url");
      states.set(state, {
        expires: Date.now() + 10 * 60000,
        session: hash(sessionId(req)),
      });
      res.redirect(authorizationUrl(state));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
  app.post("/api/clio/refresh", async (_req, res) => {
    if (refreshing) {
      res.status(409).json({ error: "A Clio refresh is already running." });
      return;
    }
    refreshing = true;
    try {
      const result = await importClioMatters();
      for (const matter of result.matters) store.saveMatter(matter);
      store.setSetting("last-clio-sync", new Date().toISOString());
      res.json({
        matters: result.matters.map((m) => ({
          id: m.id,
          number: m.number,
          clientName: m.clientName,
          stage: m.stage,
          sourceMode: m.sourceMode,
          blockers: m.blockers.length,
          importedAt: m.importedAt,
        })),
        warnings: result.warnings,
      });
    } catch (error) {
      res
        .status(502)
        .json({
          error:
            (error as Error).message ||
            "Clio import did not complete. Your previous cached matters are still available.",
        });
    } finally {
      refreshing = false;
    }
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    const isBadInput =
      error instanceof SyntaxError ||
      (error as any).type === "entity.too.large";
    res
      .status(isBadInput ? 400 : 500)
      .json({
        error: isBadInput
          ? "The request could not be read or is too large."
          : "The request could not be completed.",
      });
  });
  return app;
}
