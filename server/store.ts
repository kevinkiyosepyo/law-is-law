import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  MatterSnapshot,
  MatterSummary,
  ProviderShare,
  ApprovedItem,
} from "../shared/types.ts";

export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function summarize(m: MatterSnapshot): MatterSummary {
  return {
    id: m.id,
    number: m.number,
    clientName: m.clientName,
    stage: m.stage,
    sourceMode: m.sourceMode,
    blockers: m.blockers.length,
    importedAt: m.importedAt,
  };
}
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS matters(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS shares(id TEXT PRIMARY KEY, matter_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, payload TEXT NOT NULL);`);
  }
  getSetting<T>(key: string): T | null {
    const row = this.db
      .prepare("SELECT payload FROM settings WHERE key = ?")
      .get(key);
    return row ? (JSON.parse(row.payload as string) as T) : null;
  }
  setSetting(key: string, value: unknown) {
    this.db
      .prepare("INSERT OR REPLACE INTO settings(key,payload) VALUES(?,?)")
      .run(key, JSON.stringify(value));
  }
  saveMatter(m: MatterSnapshot) {
    this.db
      .prepare("INSERT OR REPLACE INTO matters(id,payload) VALUES(?,?)")
      .run(m.id, JSON.stringify(m));
  }
  getMatter(id: string): MatterSnapshot | null {
    const row = this.db
      .prepare("SELECT payload FROM matters WHERE id = ?")
      .get(id);
    return row ? JSON.parse(row.payload as string) : null;
  }
  listMatters(): MatterSummary[] {
    return this.db
      .prepare("SELECT payload FROM matters")
      .all()
      .map((row) => summarize(JSON.parse(row.payload as string)))
      .sort((a, b) => a.clientName.localeCompare(b.clientName));
  }
  createShare(
    matter: MatterSnapshot,
    input: {
      providerId: string;
      factIds: string[];
      blockerIds: string[];
      includeSources: boolean;
    },
  ) {
    const provider = matter.providers.find((p) => p.id === input.providerId);
    if (!provider) throw new Error("Choose a provider from this matter.");
    const factIds = [...new Set(input.factIds)];
    const blockerIds = [...new Set(input.blockerIds)];
    const facts = factIds.map((id) => {
      const f = matter.facts.find((f) => f.id === id);
      if (!f) throw new Error("One selected fact is no longer available.");
      return f;
    });
    const blockers = blockerIds.map((id) => {
      const b = matter.blockers.find((b) => b.id === id);
      if (!b || b.providerId !== provider.id)
        throw new Error(
          "Only this provider’s requests can be shared with them.",
        );
      return b;
    });
    const sourcesFor = (ids: string[]) =>
      input.includeSources
        ? ids
            .map((id) => matter.sources.find((s) => s.id === id))
            .filter((s) => s !== undefined)
            .map((s) => ({
              title: s.title,
              excerpt: s.text,
              locator: s.locator,
            }))
        : [];
    const items: ApprovedItem[] = [
      ...facts.map((f) => ({
        id: f.id,
        label: f.label,
        value: f.value,
        kind: "fact" as const,
        certainty: f.certainty,
        sources: sourcesFor(f.sourceIds),
      })),
      ...blockers.map((b) => ({
        id: b.id,
        label: b.title,
        value: `${b.description}\nSuggested next action: ${b.nextAction}`,
        kind: "request" as const,
        certainty: "inferred",
        sources: sourcesFor(b.sourceIds),
      })),
    ];
    if (!items.length)
      throw new Error("Approve at least one fact or provider request.");
    const token = randomBytes(32).toString("base64url");
    const share: ProviderShare = {
      id: randomUUID(),
      providerName: provider.name,
      matterLabel: matter.number,
      clientName: matter.clientName,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      openCount: 0,
      items,
    };
    this.db
      .prepare(
        "INSERT INTO shares(id,matter_id,token_hash,payload) VALUES(?,?,?,?)",
      )
      .run(share.id, matter.id, hash(token), JSON.stringify(share));
    return { share, token };
  }
  listShares(matterId: string): ProviderShare[] {
    return this.db
      .prepare(
        "SELECT payload FROM shares WHERE matter_id = ? ORDER BY rowid DESC",
      )
      .all(matterId)
      .map((row) => JSON.parse(row.payload as string));
  }
  revokeShare(id: string): boolean {
    const row = this.db
      .prepare("SELECT payload FROM shares WHERE id = ?")
      .get(id);
    if (!row) return false;
    const share: ProviderShare = JSON.parse(row.payload as string);
    share.revokedAt = new Date().toISOString();
    this.db
      .prepare("UPDATE shares SET payload = ? WHERE id = ?")
      .run(JSON.stringify(share), id);
    return true;
  }
  getProviderShare(token: string): ProviderShare | null {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = this.db
      .prepare("SELECT payload FROM shares WHERE token_hash = ?")
      .get(hash(token));
    if (!row) return null;
    const share: ProviderShare = JSON.parse(row.payload as string);
    if (share.revokedAt || Date.parse(share.expiresAt) <= Date.now())
      return null;
    share.openCount += 1;
    share.lastOpenedAt = new Date().toISOString();
    this.db
      .prepare("UPDATE shares SET payload = ? WHERE id = ?")
      .run(JSON.stringify(share), share.id);
    return share;
  }
  close() {
    this.db.close();
  }
}
