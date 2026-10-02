import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Store, hash } from "../server/store.ts";
import { parseTextExport } from "../server/digest.ts";
import { importMatter, importTemplate } from "../server/import.ts";
import type { MatterSnapshot } from "../shared/types.ts";

function matterForSharing(): MatterSnapshot {
  return {
    id: "matter-a",
    number: "CASE-A",
    clientName: "Alex Example",
    description: "Private attorney description",
    status: "Open",
    stage: "Treatment",
    sourceMode: "import",
    importedAt: "2026-10-02T12:00:00Z",
    asOf: "2026-10-02",
    providers: [
      { id: "provider-a", name: "Provider Alpha" },
      { id: "provider-b", name: "Provider Beta" },
    ],
    sources: [
      {
        id: "source-approved",
        type: "field",
        title: "Approved source title",
        text: "APPROVED EVIDENCE",
        locator: "Custom field 1",
        url: "https://private.example.test/matter/1",
      },
      {
        id: "source-private",
        type: "note",
        title: "Privileged attorney analysis",
        text: "PRIVATE UNAPPROVED SOURCE",
      },
      {
        id: "source-request-a",
        type: "task",
        title: "Task for Alpha",
        text: "ALPHA REQUEST EVIDENCE",
        locator: "Task 1",
      },
      {
        id: "source-request-b",
        type: "task",
        title: "Task for Beta",
        text: "BETA REQUEST EVIDENCE",
      },
    ],
    facts: [
      {
        id: "fact-approved",
        label: "Treatment status",
        value: "Treatment ongoing",
        category: "treatment",
        certainty: "recorded",
        sourceIds: ["source-approved"],
      },
      {
        id: "fact-private",
        label: "Private financial fact",
        value: "PRIVATE UNAPPROVED FACT",
        category: "financial",
        certainty: "recorded",
        sourceIds: ["source-private"],
      },
    ],
    blockers: [
      {
        id: "request-a",
        title: "Updated Alpha notes",
        description: "Waiting for Alpha notes",
        status: "awaiting_response",
        priority: "high",
        owner: "Provider Alpha",
        providerId: "provider-a",
        nextAction: "Follow up with Alpha",
        sourceIds: ["source-request-a"],
      },
      {
        id: "request-b",
        title: "Updated Beta notes",
        description: "PRIVATE BETA REQUEST",
        status: "awaiting_response",
        priority: "low",
        owner: "Provider Beta",
        providerId: "provider-b",
        nextAction: "Follow up with Beta",
        sourceIds: ["source-request-b"],
      },
      {
        id: "request-unassigned",
        title: "Internal attorney task",
        description: "PRIVATE INTERNAL TASK",
        status: "needs_review",
        priority: "medium",
        owner: "Attorney",
        nextAction: "Review privately",
        sourceIds: ["source-private"],
      },
    ],
    events: [
      {
        id: "private-event",
        title: "PRIVATE EVENT",
        category: "note",
        date: "2026-10-01",
        sourceIds: ["source-private"],
      },
    ],
    warnings: ["PRIVATE MATTER WARNING"],
  };
}

const selection = {
  providerId: "provider-a",
  factIds: ["fact-approved"],
  blockerIds: ["request-a"],
  includeSources: false,
};

test("provider share is an exact projection of approved values without unapproved case records", () => {
  const store = new Store(":memory:");
  try {
    const matter = matterForSharing();
    const { share, token } = store.createShare(matter, selection);
    const visible = store.getProviderShare(token)!;
    assert.deepEqual(visible.items, [
      {
        id: "fact-approved",
        label: "Treatment status",
        value: "Treatment ongoing",
        kind: "fact",
        certainty: "recorded",
        sources: [],
      },
      {
        id: "request-a",
        label: "Updated Alpha notes",
        value:
          "Waiting for Alpha notes\nSuggested next action: Follow up with Alpha",
        kind: "request",
        certainty: "inferred",
        sources: [],
      },
    ]);
    assert.equal(visible.providerName, "Provider Alpha");
    assert.equal(visible.clientName, matter.clientName);
    assert.equal(visible.matterLabel, matter.number);
    assert.equal(visible.openCount, 1);
    assert.ok(visible.lastOpenedAt);
    assert.equal(store.listShares(matter.id)[0].id, share.id);
    assert.ok(!JSON.stringify(visible).includes("PRIVATE"));
    assert.ok(!JSON.stringify(visible).includes("EVIDENCE"));
    assert.ok(!("blockers" in visible));
    assert.ok(!("facts" in visible));
    assert.ok(!("sources" in visible));
    assert.ok(!("events" in visible));
    assert.ok(!("token" in visible));
  } finally {
    store.close();
  }
});

test("source opt-in includes only sources attached to approved items, excluding original URLs", () => {
  const store = new Store(":memory:");
  try {
    const { token } = store.createShare(matterForSharing(), {
      ...selection,
      includeSources: true,
    });
    const visible = store.getProviderShare(token)!;
    assert.deepEqual(visible.items[0].sources, [
      {
        title: "Approved source title",
        excerpt: "APPROVED EVIDENCE",
        locator: "Custom field 1",
      },
    ]);
    assert.deepEqual(visible.items[1].sources, [
      {
        title: "Task for Alpha",
        excerpt: "ALPHA REQUEST EVIDENCE",
        locator: "Task 1",
      },
    ]);
    assert.ok(!JSON.stringify(visible).includes("PRIVATE"));
    assert.ok(!JSON.stringify(visible).includes("BETA"));
    assert.ok(!JSON.stringify(visible).includes("private.example.test"));
  } finally {
    store.close();
  }
});

test("empty, stale, unknown-provider, other-provider, and internal task selections are rejected", () => {
  const store = new Store(":memory:");
  const matter = matterForSharing();
  try {
    assert.throws(
      () =>
        store.createShare(matter, {
          ...selection,
          factIds: [],
          blockerIds: [],
        }),
      /Approve at least one/,
    );
    assert.throws(
      () => store.createShare(matter, { ...selection, providerId: "unknown" }),
      /Choose a provider/,
    );
    assert.throws(
      () =>
        store.createShare(matter, {
          ...selection,
          factIds: ["nonexistent-fact"],
        }),
      /no longer available/,
    );
    assert.throws(
      () =>
        store.createShare(matter, { ...selection, blockerIds: ["request-b"] }),
      /Only this provider/,
    );
    assert.throws(
      () =>
        store.createShare(matter, {
          ...selection,
          blockerIds: ["request-unassigned"],
        }),
      /Only this provider/,
    );
    assert.throws(
      () =>
        store.createShare(matter, {
          ...selection,
          blockerIds: ["nonexistent-request"],
        }),
      /Only this provider/,
    );
    assert.equal(store.listShares(matter.id).length, 0);
  } finally {
    store.close();
  }
});

test("approval snapshot is immutable when the underlying matter later changes", () => {
  const store = new Store(":memory:");
  try {
    const matter = matterForSharing();
    const { token } = store.createShare(matter, selection);
    matter.facts[0].value = "NEW UNAPPROVED VALUE";
    matter.blockers[0].description = "NEW UNAPPROVED REQUEST";
    store.saveMatter(matter);
    const visible = store.getProviderShare(token)!;
    assert.equal(visible.items[0].value, "Treatment ongoing");
    assert.ok(!JSON.stringify(visible).includes("NEW UNAPPROVED"));
  } finally {
    store.close();
  }
});

test("bearer tokens are high-entropy and stored only as hashes; invalid tokens cannot open shares", () => {
  const store = new Store(":memory:");
  try {
    const first = store.createShare(matterForSharing(), selection);
    const second = store.createShare(matterForSharing(), selection);
    assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first.token, second.token);
    const row = store.db
      .prepare("SELECT * FROM shares WHERE id = ?")
      .get(first.share.id)!;
    assert.equal(row.token_hash, hash(first.token));
    assert.ok(!JSON.stringify(row).includes(first.token));
    assert.ok(
      !JSON.stringify(store.listShares("matter-a")).includes(first.token),
    );
    assert.equal(store.getProviderShare(""), null);
    assert.equal(store.getProviderShare(first.token + "x"), null);
    assert.equal(store.getProviderShare("x".repeat(43)), null);
    assert.equal(store.getProviderShare(hash(first.token)), null);
  } finally {
    store.close();
  }
});

test("revoked and expired shares cannot be read and do not increment open counts", () => {
  const store = new Store(":memory:");
  try {
    const revoked = store.createShare(matterForSharing(), selection);
    assert.equal(store.revokeShare(revoked.share.id), true);
    assert.equal(store.getProviderShare(revoked.token), null);
    assert.equal(store.revokeShare("nonexistent-share"), false);
    const expired = store.createShare(matterForSharing(), selection);
    expired.share.expiresAt = "2000-01-01T00:00:00Z";
    store.db
      .prepare("UPDATE shares SET payload = ? WHERE id = ?")
      .run(JSON.stringify(expired.share), expired.share.id);
    assert.equal(store.getProviderShare(expired.token), null);
    assert.ok(
      store.listShares("matter-a").every((share) => share.openCount === 0),
    );
  } finally {
    store.close();
  }
});

test("duplicate selections do not duplicate disclosure and shares stay scoped to their matter", () => {
  const store = new Store(":memory:");
  try {
    const { share } = store.createShare(matterForSharing(), {
      ...selection,
      factIds: ["fact-approved", "fact-approved"],
      blockerIds: ["request-a", "request-a"],
    });
    assert.equal(share.items.length, 2);
    assert.equal(store.listShares("other-matter").length, 0);
  } finally {
    store.close();
  }
});

test("sample, imported, and live cached versions of the same number coexist without overwrites", () => {
  const store = new Store(":memory:");
  try {
    const fixture = readFileSync(
      fileURLToPath(new URL("../fixtures/example-case.txt", import.meta.url)),
      "utf8",
    );
    const sample = parseTextExport(fixture, "sample");
    const importedText = parseTextExport(fixture, "import");
    const importedJson = importMatter(
      JSON.stringify({
        ...importTemplate,
        matter: {
          ...importTemplate.matter,
          id: sample.id,
          number: sample.number,
        },
      }),
    );
    const live: MatterSnapshot = {
      ...sample,
      id: `clio-matter-${sample.number}`,
      sourceMode: "clio",
    };
    assert.match(sample.id, /^sample-/);
    assert.match(importedText.id, /^import-/);
    assert.match(importedJson.id, /^import-/);
    const matters = [sample, importedText, importedJson, live];
    assert.equal(new Set(matters.map((matter) => matter.id)).size, 4);
    matters.forEach((matter) => store.saveMatter(matter));
    assert.equal(store.listMatters().length, 4);
    matters.forEach((matter) =>
      assert.equal(store.getMatter(matter.id)?.sourceMode, matter.sourceMode),
    );
    store.saveMatter({ ...live, stage: "Litigation" });
    assert.equal(store.getMatter(live.id)?.stage, "Litigation");
    assert.equal(store.getMatter(sample.id)?.stage, sample.stage);
    assert.equal(store.listMatters().length, 4);
  } finally {
    store.close();
  }
});
