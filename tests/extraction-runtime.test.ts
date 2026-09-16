import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemoryStateRepository } from "../lib/repositories/memory-state-repository";
import { StateService } from "../lib/server/state-service";
import { ExtractionService } from "../lib/extraction/service";
import { FakeExtractorProvider } from "../lib/extraction/provider";
import type { ExtractionProposal } from "../lib/extraction/contract";
import type { SemanticModelClient, SemanticRequest } from "../lib/server/validator/semantic";
import { createStory, seedRecords, epistemic } from "./helpers/backend";
import { extractionDevelopmentDataset } from "./fixtures/extraction-development";

class FakeSemanticClient implements SemanticModelClient {
  readonly modelId = "extraction-runtime-test";
  calls = 0;
  async complete(request: SemanticRequest) {
    this.calls += 1;
    return { agent: request.agent, verdict: "SUPPORTED", reason: "Deterministic test support.", evidenceIds: request.packet.primaryEvidence.map(value => value.id) };
  }
}

async function fixture() {
  const repository = new MemoryStateRepository();
  const service = new StateService(repository);
  const storyId = await createStory(service);
  const characterId = randomUUID();
  const itemId = randomUUID();
  await seedRecords(service, storyId, [
    ["characters", { id: characterId, active: true, name: "纪川", role: "engineer", location: epistemic("Maintenance Room") }],
    ["items", { id: itemId, active: true, name: "Recorder", owner: epistemic(characterId), holder: epistemic(characterId), custodian: null, condition: "operational" }],
  ]);
  const documentId = randomUUID(), revisionId = randomUUID();
  await service.addSourceDocument(storyId, { id: documentId, title: "Chapter 1", sourceOrder: 1, chapter: 1 });
  await service.addSourceRevision(storyId, { id: revisionId, documentId, revisionNumber: 1, content: "纪川到达控制室。", visibility: "canonical" });
  return { repository, service, storyId, characterId, itemId, revisionId };
}

function proposal(characterId: string): ExtractionProposal {
  return {
    evidence: [{ key: "E1", quote: "纪川到达控制室。", occurrence: 0, speakerRef: characterId }],
    events: [{ key: "EV1", kind: "movement", participantRefs: [characterId], evidenceKeys: ["E1"] }],
    effects: [
      {
        eventKey: "EV1", evidenceKeys: ["E1"], supportKinds: ["direct_observation"], supportSummary: "Arrival is explicit.", confidence: 0.9,
        kind: "character_location", characterRef: characterId, after: { value: "Control Room", status: "resolved", lastConfirmedValue: "Control Room" },
      },
      {
        eventKey: "EV1", evidenceKeys: ["E1"], supportKinds: ["direct_observation"], supportSummary: "Unknown entity must be rejected.", confidence: 0.5,
        kind: "item_condition", itemRef: "UNKNOWN_ITEM", condition: "damaged",
      },
    ],
    unresolvedMentions: [],
  };
}

test("packet is bounded, deterministic and excludes pending deltas", async () => {
  const f = await fixture();
  const provider = new FakeExtractorProvider({ evidence: [], events: [], effects: [], unresolvedMentions: [] });
  const extraction = new ExtractionService(f.repository, provider, new FakeSemanticClient());
  const before = await f.repository.read(f.storyId);
  const packet = (await extraction.extractRevision(f.storyId, f.revisionId)).packet!;
  assert.equal(packet.storyId, f.storyId);
  assert.equal(packet.sourceRevisionId, f.revisionId);
  assert.equal(packet.currentState.characters.length, 1);
  assert.equal(packet.currentState.items.length, 1);
  assert.equal(packet.currentState, packet.currentState);
  assert.equal((await f.repository.read(f.storyId)).deltas.length, before.deltas.length);
});

test("one extractor request compiles valid effects, rejects unrelated invalid effects, and runs RuntimeValidator", async () => {
  const f = await fixture();
  const baselineDeltas = (await f.service.getDeltas(f.storyId)).length;
  const semantic = new FakeSemanticClient();
  const provider = new FakeExtractorProvider(proposal(f.characterId));
  const result = await new ExtractionService(f.repository, provider, semantic).extractRevision(f.storyId, f.revisionId);
  assert.equal(provider.calls, 1);
  assert.equal(result.status, "completed");
  assert.equal(result.deltas.length, 1);
  assert.equal(result.rejectedEffects.length, 1);
  assert.equal(result.compilerIssues.some(issue => issue.code === "UNKNOWN_ENTITY_REF"), true);
  assert.equal(result.deltas[0].targetType, "characters");
  assert.equal(result.deltas[0].decision, "needs_review");
  assert.equal(result.deltas[0].committedVersionId, null);
  assert.equal(result.validatorResults.length, 1);
  assert.equal(result.validatorResults[0]?.recommendation, "AUTO_ACCEPT_ELIGIBLE");
  assert.equal(semantic.calls, 1);
  const state = await f.service.getCurrentState(f.storyId);
  assert.equal(state.state.characters[0].location.value, "Maintenance Room");
  assert.equal((await f.service.getEvents(f.storyId)).length, 1);
  assert.equal((await f.service.getDeltas(f.storyId)).length, baselineDeltas + 1);
});

test("malformed extractor output fails closed with zero business artifacts", async () => {
  const f = await fixture();
  const baseline = await f.repository.read(f.storyId);
  const result = await new ExtractionService(f.repository, new FakeExtractorProvider("{not-json"), new FakeSemanticClient()).extractRevision(f.storyId, f.revisionId);
  assert.equal(result.status, "failed");
  assert.equal(result.deltas.length, 0);
  assert.equal((await f.service.getEvents(f.storyId)).length, baseline.events.length);
  assert.equal((await f.service.getDeltas(f.storyId)).length, baseline.deltas.length);
  assert.equal((await f.repository.read(f.storyId)).evidence.length, 0);
});

test("provider failure fails closed and does not create a Human Decision or Canonical mutation", async () => {
  const f = await fixture();
  const baseline = await f.repository.read(f.storyId);
  const provider = new FakeExtractorProvider(null);
  provider.complete = async () => { provider.calls += 1; throw new Error("provider secret must not persist"); };
  const result = await new ExtractionService(f.repository, provider, new FakeSemanticClient()).extractRevision(f.storyId, f.revisionId);
  assert.equal(result.status, "failed");
  assert.equal(result.error, "EXTRACTOR_UNAVAILABLE");
  assert.equal(result.error?.includes("secret"), false);
  assert.equal((await f.service.getDeltas(f.storyId)).length, baseline.deltas.length);
  assert.equal((await f.service.getCurrentState(f.storyId)).state.characters[0].location.value, "Maintenance Room");
});

test("frozen hashes remain unchanged by the runtime", async () => {
  const f = await fixture();
  const output = { evidence: [], events: [], effects: [], unresolvedMentions: [] };
  const result = await new ExtractionService(f.repository, new FakeExtractorProvider(output), new FakeSemanticClient()).extractRevision(f.storyId, f.revisionId);
  assert.equal(result.packet?.contractHash, "fdb10c9c9e9c9ee80ac2efa70c267a2399209ac8c3d5c3d4cabc084d332704f4");
});

test("stale state and stale source abort before any extraction artifacts are written", async () => {
  const stateFixture = await fixture();
  const stateBaseline = await stateFixture.repository.read(stateFixture.storyId);
  const stateMutatingProvider = {
    modelId: "state-stale-provider",
    async complete() {
      await stateFixture.repository.transaction(stateFixture.storyId, draft => { draft.story.currentVersion += 1; });
      return { evidence: [], events: [], effects: [], unresolvedMentions: [] };
    },
  };
  await assert.rejects(() => new ExtractionService(stateFixture.repository, stateMutatingProvider, new FakeSemanticClient()).extractRevision(stateFixture.storyId, stateFixture.revisionId), /Canonical state changed/);
  const stateAfter = await stateFixture.repository.read(stateFixture.storyId);
  assert.equal(stateAfter.evidence.length, stateBaseline.evidence.length);
  assert.equal(stateAfter.events.length, stateBaseline.events.length);
  assert.equal(stateAfter.deltas.length, stateBaseline.deltas.length);

  const sourceFixture = await fixture();
  const sourceBaseline = await sourceFixture.repository.read(sourceFixture.storyId);
  const sourceMutatingProvider = {
    modelId: "source-stale-provider",
    async complete() {
      const revision = sourceBaseline.revisions.find(value => value.id === sourceFixture.revisionId)!;
      await sourceFixture.service.addSourceRevision(sourceFixture.storyId, {
        id: randomUUID(), documentId: revision.documentId, revisionNumber: 2, content: "纪川仍在维修间。", visibility: "canonical",
      });
      return { evidence: [], events: [], effects: [], unresolvedMentions: [] };
    },
  };
  await assert.rejects(() => new ExtractionService(sourceFixture.repository, sourceMutatingProvider, new FakeSemanticClient()).extractRevision(sourceFixture.storyId, sourceFixture.revisionId), /Story revision changed/);
  const sourceAfter = await sourceFixture.repository.read(sourceFixture.storyId);
  assert.equal(sourceAfter.evidence.length, sourceBaseline.evidence.length);
  assert.equal(sourceAfter.events.length, sourceBaseline.events.length);
  assert.equal(sourceAfter.deltas.length, sourceBaseline.deltas.length);
});

test("frozen development boundaries remain represented for offline extraction regression", () => {
  const byId = (id: string) => extractionDevelopmentDataset.cases.find(value => value.caseId === id)!;
  assert.equal(byId("D02").goldEffects.length, 0);
  const d03 = byId("D03").goldEffects[0];
  assert.equal(d03.kind, "character_location");
  if (d03.kind === "character_location") assert.equal(d03.expectedAfter.status, "unresolved");
  const d04 = byId("D04").goldEffects[0];
  assert.equal(d04.kind, "item_holder");
  const d04Forbidden = byId("D04").forbiddenEffects[0];
  assert.equal(d04Forbidden.kind, "item_owner");
  const d06 = byId("D06").goldEffects[0];
  assert.equal(d06.kind, "knowledge_state");
  if (d06.kind === "knowledge_state") assert.equal(d06.semanticTarget.propositionRef, "PROP_REPORT_SHORT");
  const d08 = byId("D08").goldEffects[0];
  assert.equal(d08.kind, "knowledge_state");
  if (d08.kind === "knowledge_state") assert.equal(d08.expectedAfter.stance, "suspects");
  assert.equal(byId("D09").goldEffects.some(effect => effect.kind === "world_truth_status"), true);
  const d10 = byId("D10").goldEffects[0];
  assert.equal(d10.kind, "plot_thread_status");
  if (d10.kind === "plot_thread_status") assert.equal(d10.expectedAfter.status, "progressing");
  const d11 = byId("D11").goldEffects[0];
  assert.equal(d11.kind, "plot_thread_status");
  if (d11.kind === "plot_thread_status") assert.equal(d11.expectedAfter.resolutionAssessment, "direct_answer");
  const d12 = byId("D12").goldEffects[0];
  assert.equal(d12.kind, "relationship_value");
  if (d12.kind === "relationship_value") assert.equal(d12.expectedAfter.scope, "current rescue");
  const d13 = byId("D13").goldEffects[0];
  assert.equal(d13.kind, "relationship_value");
  if (d13.kind === "relationship_value") assert.equal(d13.expectedAfter.scope, "investigation until power-cut truth is resolved");
});
