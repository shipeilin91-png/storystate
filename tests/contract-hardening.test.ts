import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DomainError } from "../lib/domain/errors";
import type { Character, Item, StateDelta } from "../lib/domain/state";
import { StateService } from "../lib/server/state-service";
import { accept, createStory, epistemic, openRepository, proposal, seedRecords } from "./helpers/backend";

const character = (name: string): Character => ({ id: randomUUID(), active: true, name, role: "fixture", location: epistemic("Hospital") });
const decision = (value: string) => ({ decision: value, actor: "reviewer", reason: "Contract gate audit" });
const denied = (code: string) => (error: unknown) => error instanceof DomainError && error.code === code;

const cases: { label: string; result: StateDelta["validatorResult"]; error?: string }[] = [
  { label: "null", result: null },
  { label: "passed/AUTO_ACCEPT_ELIGIBLE", result: { status: "passed", recommendation: "AUTO_ACCEPT_ELIGIBLE", risk: "LOW", reason: "Eligible" } },
  { label: "needs_review/NEEDS_REVIEW", result: { status: "needs_review", recommendation: "NEEDS_REVIEW", risk: "HIGH", reason: "Human review required" } },
  { label: "passed/NEEDS_REVIEW", result: { status: "passed", recommendation: "NEEDS_REVIEW", risk: "HIGH", reason: "Structurally valid, high impact" } },
  { label: "failed/REJECT", result: { status: "failed", recommendation: "REJECT", risk: "HIGH", reason: "Insufficient evidence" }, error: "VALIDATOR_REJECTED" },
  { label: "passed/REJECT", result: { status: "passed", recommendation: "REJECT", risk: "HIGH", reason: "Boundary violation" }, error: "VALIDATOR_REJECTED" },
  { label: "conflict/CONFLICT", result: { status: "conflict", recommendation: "CONFLICT", risk: "CONFLICT", reason: "Unresolved conflict" }, error: "UNRESOLVED_CONFLICT" },
  { label: "passed/CONFLICT", result: { status: "passed", recommendation: "CONFLICT", risk: "CONFLICT", reason: "Conflicting candidate" }, error: "UNRESOLVED_CONFLICT" },
  // Status alone must deny admission even if a recommendation is permissive.
  { label: "failed/AUTO_ACCEPT_ELIGIBLE", result: { status: "failed", recommendation: "AUTO_ACCEPT_ELIGIBLE", risk: "HIGH", reason: "Inconsistent legacy result" }, error: "VALIDATOR_REJECTED" },
  { label: "conflict/NEEDS_REVIEW", result: { status: "conflict", recommendation: "NEEDS_REVIEW", risk: "CONFLICT", reason: "Inconsistent legacy result" }, error: "UNRESOLVED_CONFLICT" },
];

for (const adapter of ["memory", "postgres"] as const) {
  test(`${adapter}: validator admission at decision and commit, including forged accepted rows`, async (t) => {
    const { repository, close } = await openRepository(adapter);
    try {
      const service = new StateService(repository);
      for (const fixture of cases) await t.test(fixture.label, async () => {
        const storyId = await createStory(service), person = character("A");
        await seedRecords(service, storyId, [["characters", person]]);
        const d = await service.proposeDelta(storyId, proposal("characters", person.id, person.location, epistemic("Dock"), "location"));
        await service.setValidatorResult(storyId, d.id, fixture.result);
        assert.equal((await service.getDeltas(storyId)).find(row => row.id === d.id)?.decision, "needs_review");
        await assert.rejects(service.commitAcceptedDeltas(storyId, { deltaIds: [d.id], expectedVersion: 1 }), denied("NOT_ACCEPTED"));
        if (!fixture.error) {
          await accept(service, storyId, d.id);
          const v = await service.commitAcceptedDeltas(storyId, { deltaIds: [d.id], expectedVersion: 1 });
          assert.equal(v.versionNumber, 2);
          assert.equal(v.snapshot.characters[0].location.value, "Dock");
          assert.equal((await service.getDeltas(storyId)).find(row => row.id === d.id)?.decisions.at(-1)?.decision, "accepted");
          return;
        }
        const beforeAttempt = await repository.read(storyId);
        await assert.rejects(accept(service, storyId, d.id), denied(fixture.error));
        assert.deepEqual(await repository.read(storyId), beforeAttempt);
        for (const value of ["rejected", "deferred", "needs_review"]) await service.decideDelta(storyId, d.id, decision(value));
        assert.deepEqual((await service.getDeltas(storyId)).find(row => row.id === d.id)?.decisions.map(row => row.decision), ["rejected", "deferred", "needs_review"]);

        // Simulate legacy/migrated data bypassing decideDelta, not the service gate.
        await repository.transaction(storyId, draft => { draft.deltas.find(row => row.id === d.id)!.decision = "accepted"; });
        const valid = await service.proposeDelta(storyId, proposal("characters", person.id, "fixture", "updated role", "role"));
        await accept(service, storyId, valid.id);
        const beforeCommit = await repository.read(storyId);
        await assert.rejects(service.commitAcceptedDeltas(storyId, { deltaIds: [valid.id, d.id], expectedVersion: 1 }), denied(fixture.error));
        assert.deepEqual(await repository.read(storyId), beforeCommit, "No partial state, version, delta link or audit changes");
      });
      await t.test("validator changes after human acceptance still block commit", async () => {
        const storyId = await createStory(service), person = character("B");
        await seedRecords(service, storyId, [["characters", person]]);
        const d = await service.proposeDelta(storyId, proposal("characters", person.id, person.location, epistemic("Dock"), "location"));
        await accept(service, storyId, d.id);
        await service.setValidatorResult(storyId, d.id, cases[4].result);
        const before = await repository.read(storyId);
        await assert.rejects(service.commitAcceptedDeltas(storyId, { deltaIds: [d.id], expectedVersion: 1 }), denied("VALIDATOR_REJECTED"));
        assert.deepEqual(await repository.read(storyId), before);
      });
    } finally { await close(); }
  });

  test(`${adapter}: custodian slot validates same-story active references before persistence`, async (t) => {
    const { repository, close } = await openRepository(adapter);
    try {
      const service = new StateService(repository), storyId = await createStory(service);
      const a = character("owner"), b = character("holder"), c = character("custodian"), inactive = { ...character("inactive"), active: false };
      await seedRecords(service, storyId, [["characters", a], ["characters", b], ["characters", c], ["characters", { ...inactive, active: true }]]);
      const retire = await service.proposeDelta(storyId, proposal("characters", inactive.id, { ...inactive, active: true }, inactive, "$", { operation: "INVALIDATE" }));
      await accept(service, storyId, retire.id);
      await service.commitAcceptedDeltas(storyId, { deltaIds: [retire.id], expectedVersion: 1 });
      const otherId = await createStory(service), foreign = character("other story");
      await seedRecords(service, otherId, [["characters", foreign]]);
      const missing = randomUUID();
      const fixtures: { label: string; custodian: Item["custodian"]; valid: boolean }[] = [
        { label: "absent slot", custodian: null, valid: true },
        { label: "owner A / holder B / custodian C", custodian: epistemic(c.id), valid: true },
        { label: "unresolved with last confirmed C", custodian: epistemic(null, c.id), valid: true },
        { label: "unresolved without history", custodian: epistemic(null), valid: true },
        { label: "nonexistent value", custodian: epistemic(missing), valid: false },
        { label: "nonexistent last confirmed", custodian: epistemic(null, missing), valid: false },
        { label: "inactive value", custodian: epistemic(inactive.id), valid: false },
        { label: "inactive last confirmed", custodian: epistemic(null, inactive.id), valid: false },
        { label: "cross-story value", custodian: epistemic(foreign.id), valid: false },
        { label: "cross-story last confirmed", custodian: epistemic(null, foreign.id), valid: false },
      ];
      for (const fixture of fixtures) await t.test(fixture.label, async () => {
        const item: Item = { id: randomUUID(), active: true, name: "Independent slots", owner: epistemic(a.id), holder: epistemic(b.id), custodian: fixture.custodian, condition: "sealed" };
        const d = await service.proposeDelta(storyId, proposal("items", item.id, null, item));
        await accept(service, storyId, d.id);
        const before = await repository.read(storyId);
        const commit = () => service.commitAcceptedDeltas(storyId, { deltaIds: [d.id], expectedVersion: before.story.currentVersion });
        if (!fixture.valid) {
          await assert.rejects(commit(), denied("FOREIGN_REFERENCE"), "DomainError, not PostgreSQL FK failure");
          assert.deepEqual(await repository.read(storyId), before);
        } else {
          const v = await commit();
          assert.deepEqual(v.snapshot.items.find(row => row.id === item.id), item);
          assert.deepEqual((await service.getCurrentState(storyId)).state.items.find(row => row.id === item.id), item);
        }
      });
      await t.test("field update uses the same gate and permits clearing the slot", async () => {
        const item = (await service.getCurrentState(storyId)).state.items.find(row => row.custodian?.value === c.id)!;
        const bad = await service.proposeDelta(storyId, proposal("items", item.id, item.custodian, epistemic(null, missing), "custodian"));
        await accept(service, storyId, bad.id);
        const before = await repository.read(storyId);
        await assert.rejects(service.commitAcceptedDeltas(storyId, { deltaIds: [bad.id], expectedVersion: before.story.currentVersion }), denied("FOREIGN_REFERENCE"));
        assert.deepEqual(await repository.read(storyId), before);
        const clear = await service.proposeDelta(storyId, proposal("items", item.id, item.custodian, null, "custodian"));
        await accept(service, storyId, clear.id);
        const version = await service.commitAcceptedDeltas(storyId, { deltaIds: [clear.id], expectedVersion: before.story.currentVersion });
        assert.deepEqual(version.snapshot.items.find(row => row.id === item.id), { ...item, custodian: null });
      });
    } finally { await close(); }
  });
}
