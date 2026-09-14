import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import type { StateRepository } from "../lib/repositories/state-repository";
import { PostgresStateRepository } from "../lib/repositories/postgres-state-repository";
import { RuntimeValidator } from "../lib/server/validator/runtime-validator";
import { FakeSemanticClient, runtimeFixture, supported, withoutValidatorResults } from "./fixtures/runtime-validator";
import { accept, epistemic, openRepository } from "./helpers/backend";

for (const adapter of ["memory", "postgres"] as const) {
  test(`${adapter}: incompatible pending candidate is CONFLICT before model calls`, async () => {
    const { repository, close } = await openRepository(adapter);
    try {
      const client = new FakeSemanticClient(), f = await runtimeFixture("Ch13-A", repository, client);
      await f.service.proposeDelta(f.storyId, { ...f.input, after: epistemic(f.ids.Gu) });
      const before = await repository.read(f.storyId);
      const result = await f.service.validateDelta(f.storyId, f.delta.id, { expectedVersion: 1 });
      assert.equal(result.status, "conflict");
      assert.equal(result.risk, "CONFLICT");
      assert.equal(result.recommendation, "CONFLICT");
      assert.equal(client.requests.length, 0);
      const after = await repository.read(f.storyId);
      before.deltas.sort((a, b) => a.id.localeCompare(b.id));
      after.deltas.sort((a, b) => a.id.localeCompare(b.id));
      assert.deepEqual(withoutValidatorResults(after), withoutValidatorResults(before));
      await assert.rejects(accept(f.service, f.storyId, f.delta.id), /conflict/i);
    } finally { await close(); }
  });

  test(`${adapter}: equal whole-record and field effects are not contradictory`, async () => {
    const { repository, close } = await openRepository(adapter);
    try {
      const f = await runtimeFixture("Ch13-A", repository), state = await f.service.getCurrentState(f.storyId);
      const item = state.state.items[0];
      const whole = await f.service.proposeDelta(f.storyId, { ...f.input, fieldPath: "$", before: item, after: { ...item, holder: epistemic(f.ids.Lin) } });
      await accept(f.service, f.storyId, whole.id);
      const result = await f.service.validateDelta(f.storyId, f.delta.id, { expectedVersion: 1 });
      assert.equal(result.recommendation, "AUTO_ACCEPT_ELIGIBLE");
      await accept(f.service, f.storyId, f.delta.id);
      const wholeResult = await f.service.validateDelta(f.storyId, whole.id, { expectedVersion: 1 });
      assert.equal(wholeResult.recommendation, "NEEDS_REVIEW", "Whole item impact still requires review, not CONFLICT");
      assert.deepEqual(await f.service.getCurrentState(f.storyId), state);
      await assert.rejects(f.service.commitAcceptedDeltas(f.storyId, { deltaIds: [whole.id, f.delta.id], expectedVersion: 1 }), /before value/);
      assert.deepEqual(await f.service.getCurrentState(f.storyId), state, "Equivalent proposals cannot be double-applied");
    } finally { await close(); }
  });
}

test("whole-record conflict comparison uses changed fields, preserving incompatible and lifecycle conflicts", async (t) => {
  for (const variant of ["orthogonal", "different_holder", "invalidate", "duplicate_field", "rejected", "deferred"] as const)
    await t.test(variant, async () => {
      const f = await runtimeFixture(), item = (await f.service.getCurrentState(f.storyId)).state.items[0];
      const after = variant === "orthogonal" ? { ...item, condition: "opened" } :
        variant === "invalidate" ? { ...item, active: false } : { ...item, holder: epistemic(f.ids.Gu) };
      const input = variant === "duplicate_field" ? f.input : {
        ...f.input, fieldPath: "$", before: item, after, operation: variant === "invalidate" ? "INVALIDATE" as const : "UPDATE" as const,
      };
      const other = await f.service.proposeDelta(f.storyId, input);
      await f.service.decideDelta(f.storyId, other.id, {
        decision: variant === "rejected" || variant === "deferred" ? variant : "accepted",
        actor: "reviewer", reason: "Independent competing candidate",
      });
      const result = await f.service.validateDelta(f.storyId, f.delta.id, { expectedVersion: 1 });
      assert.equal(result.recommendation, ["different_holder", "invalidate"].includes(variant) ? "CONFLICT" : "AUTO_ACCEPT_ELIGIBLE");
    });
});

test("representation-only changes in repository reads do not stale the validation snapshot", async (t) => {
  for (const change of ["row_order", "object_keys", "join_order"] as const) await t.test(change, async () => {
    const f = await runtimeFixture();
    const repository: StateRepository = {
      create: value => f.repository.create(value),
      read: async id => {
        const aggregate = await f.repository.read(id);
        if (change === "row_order") {
          for (const list of Object.values(aggregate.state)) list.reverse();
          aggregate.deltas.reverse(); aggregate.events.reverse(); aggregate.evidence.reverse();
        } else if (change === "join_order") {
          for (const event of aggregate.events) { event.participantIds.reverse(); event.evidenceIds.reverse(); }
          for (const delta of aggregate.deltas) delta.evidenceIds.reverse();
        } else {
          aggregate.story = Object.fromEntries(Object.entries(aggregate.story).reverse()) as typeof aggregate.story;
        }
        return aggregate;
      },
      transaction: (id, work) => f.repository.transaction(id, work),
    };
    const before = await f.repository.read(f.storyId);
    const result = await new RuntimeValidator(repository, new FakeSemanticClient()).validate(f.storyId, f.delta.id, 1);
    assert.equal(result.recommendation, "AUTO_ACCEPT_ELIGIBLE");
    assert.deepEqual(withoutValidatorResults(await f.repository.read(f.storyId)), withoutValidatorResults(before));
  });
});

test("PGlite plan change without data updates does not reject a valid validation result", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("supabase/migrations/20260914000100_canonical_state_foundation.sql", "utf8"));
    const connection = { query: (sql: string, args?: unknown[]) => db.query(sql, args), release: () => {} };
    const repository = new PostgresStateRepository({ query: connection.query, connect: async () => connection } as unknown as Pool);
    const f = await runtimeFixture("Ch13-A", repository);
    // Ensure physical row order differs from primary-key index order.
    await db.exec("CLUSTER characters USING characters_pkey; SET enable_indexscan=off; SET enable_bitmapscan=off;");
    const sorted = (await repository.read(f.storyId)).state.characters;
    await db.query("UPDATE characters SET role=role WHERE story_id=$1 AND id=$2", [f.storyId, sorted[0].id]);
    const before = await repository.read(f.storyId);
    const client = new FakeSemanticClient(async request => {
      await db.exec("SET enable_indexscan=on; SET enable_seqscan=off; SET enable_bitmapscan=off;");
      return supported(request);
    });
    const result = await new RuntimeValidator(repository, client).validate(f.storyId, f.delta.id, 1);
    const after = await repository.read(f.storyId);
    assert.notDeepEqual(before.state.characters.map(row => row.id), after.state.characters.map(row => row.id));
    assert.deepEqual([...before.state.characters].sort((a, b) => a.id.localeCompare(b.id)), [...after.state.characters].sort((a, b) => a.id.localeCompare(b.id)));
    assert.equal(result.recommendation, "AUTO_ACCEPT_ELIGIBLE");
    assert.equal(after.story.currentVersion, before.story.currentVersion);
  } finally { await db.close(); }
});

test("normalizing object keys must not ignore ordered source payload changes", async () => {
  const f = await runtimeFixture();
  await f.repository.transaction(f.storyId, a => { a.events[0].payload = { orderedActions: ["enter", "leave"] }; });
  const repository: StateRepository = {
    create: value => f.repository.create(value),
    read: async id => {
      const aggregate = await f.repository.read(id);
      aggregate.events[0].payload = { orderedActions: ["leave", "enter"] };
      return aggregate;
    },
    transaction: (id, work) => f.repository.transaction(id, work),
  };
  await assert.rejects(new RuntimeValidator(repository, new FakeSemanticClient()).validate(f.storyId, f.delta.id, 1), /inputs changed/);
});
