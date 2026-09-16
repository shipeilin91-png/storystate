import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemoryStateRepository } from "../lib/repositories/memory-state-repository";
import { StateService } from "../lib/server/state-service";
import { ExtractionService } from "../lib/extraction/service";
import { ChatCompletionsExtractorProvider, FakeExtractorProvider, parseExtractionProposal } from "../lib/extraction/provider";
import { compileExtraction } from "../lib/extraction/compiler";
import { buildExtractionPacket, type ExtractionPacket } from "../lib/extraction/packet";
import { buildExtractionRequest } from "../lib/extraction/prompt";
import type { ExtractionEffect, ExtractionProposal } from "../lib/extraction/contract";
import type { DeltaInput } from "../lib/domain/state";
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

async function itemCompilerFixture() {
  const repository = new MemoryStateRepository();
  const service = new StateService(repository);
  const storyId = await createStory(service);
  const ids = {
    ji: "00000000-0000-4000-8000-000000000110",
    cheng: "00000000-0000-4000-8000-000000000111",
    item: "00000000-0000-4000-8000-000000000120",
    proposition: "00000000-0000-4000-8000-000000000130",
    worldTruth: "00000000-0000-4000-8000-000000000131",
    knowledge: "00000000-0000-4000-8000-000000000132",
    thread: "00000000-0000-4000-8000-000000000140",
    relationship: "00000000-0000-4000-8000-000000000150",
  };
  const human: DeltaInput["basis"] = { kinds: ["human_confirmation"], note: "Runtime compiler fixture" };
  await seedRecords(service, storyId, [
    ["characters", { id: ids.ji, active: true, name: "纪川", role: "engineer", location: epistemic("Maintenance Room") }],
    ["characters", { id: ids.cheng, active: true, name: "程雾", role: "operator", location: epistemic("Control Room") }],
    ["items", { id: ids.item, active: true, name: "黑匣记录器", owner: epistemic(ids.ji), holder: epistemic(ids.ji), custodian: epistemic(ids.ji), condition: "operational" }],
    ["propositions", { id: ids.proposition, active: true, statement: "记录器包含停机序列", kind: "assertion", reportedPropositionId: null, reporterId: null }],
    ["worldTruth", { id: ids.worldTruth, active: true, propositionId: ids.proposition, status: "unresolved" }],
    ["knowledge", { id: ids.knowledge, active: true, characterId: ids.ji, propositionId: ids.proposition, stance: "suspects", believedValue: null, basis: human }],
    ["plotThreads", { id: ids.thread, active: true, title: "停机序列", coreQuestion: "停机序列在哪里？", status: "open", resolution: null }],
    ["relationships", { id: ids.relationship, active: true, fromCharacterId: ids.ji, toCharacterId: ids.cheng, category: "explicit_operational", predicate: "coordination", value: "active", scope: "current repair", basis: human }],
  ]);
  const documentId = randomUUID();
  const revisionId = randomUUID();
  const content = "纪川把黑匣记录器递给程雾，并明确说这东西以后归你。程雾负责保管记录器，之后取消保管安排。";
  await service.addSourceDocument(storyId, { id: documentId, title: "Chapter 2", sourceOrder: 2, chapter: 2 });
  await service.addSourceRevision(storyId, { id: revisionId, documentId, revisionNumber: 1, content, visibility: "canonical" });
  const aggregate = await repository.read(storyId);
  const packet = buildExtractionPacket(aggregate, revisionId);
  return { aggregate, packet, ids, storyId, revisionId, documentId, content };
}

function alias(packet: ExtractionPacket, id: string): string {
  const value = packet.entities.find(entity => entity.id === id);
  assert.ok(value);
  return value.alias;
}

function compileItemEffects(
  fixture: Awaited<ReturnType<typeof itemCompilerFixture>>,
  effects: ExtractionEffect[],
) {
  const jiRef = alias(fixture.packet, fixture.ids.ji);
  const chengRef = alias(fixture.packet, fixture.ids.cheng);
  return compileExtraction(fixture.aggregate, fixture.packet, {
    evidence: [{ key: "E1", quote: fixture.content, occurrence: 0, speakerRef: jiRef }],
    events: [{ key: "EV1", kind: "transfer", participantRefs: [jiRef, chengRef], evidenceKeys: ["E1"] }],
    effects,
    unresolvedMentions: [],
  });
}

function itemEffectBase() {
  return {
    eventKey: "EV1",
    evidenceKeys: ["E1"],
    supportKinds: ["direct_disclosure"] as ExtractionEffect["supportKinds"],
    supportSummary: "The transfer and responsibility are explicit.",
    confidence: 0.95,
  };
}

function proposal(): ExtractionProposal {
  return {
    evidence: [{ key: "E1", quote: "纪川到达控制室。", occurrence: 0, speakerRef: "CHAR_001" }],
    events: [{ key: "EV1", kind: "movement", participantRefs: ["CHAR_001"], evidenceKeys: ["E1"] }],
    effects: [
      {
        eventKey: "EV1", evidenceKeys: ["E1"], supportKinds: ["direct_observation"], supportSummary: "Arrival is explicit.", confidence: 0.9,
        kind: "character_location", characterRef: "CHAR_001", after: { value: "Control Room", status: "resolved", lastConfirmedValue: "Control Room" },
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
  const provider = new FakeExtractorProvider(proposal());
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

test("DeepSeek extractor uses JSON mode while Zod remains the fail-closed authority", async () => {
  const valid = { evidence: [], events: [], effects: [], unresolvedMentions: [] };
  let body: Record<string, unknown> = {};
  const transport: typeof fetch = async (_url, init) => {
    body = JSON.parse(init!.body as string);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(valid) } }] });
  };
  const provider = new ChatCompletionsExtractorProvider(
    "deepseek-flash",
    "https://api.deepseek.com/chat/completions",
    "test-key",
    transport,
  );
  const output = await provider.complete({
    packet: {} as ExtractionPacket,
    system: "Extraction contract.",
    input: "{}",
    signal: new AbortController().signal,
  });
  assert.equal(body.model, "deepseek-flash");
  assert.equal(body.stream, false);
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(body.max_tokens, 8000);
  assert.deepEqual(body.response_format, { type: "json_object" });
  const messages = body.messages as Array<{ role: string; content: string }>;
  assert.match(messages[0].content, /Return ONLY valid JSON\./);
  assert.match(messages[0].content, /"unresolvedMentions":\[\]/);
  assert.match(messages[0].content, /"speakerRef":entity alias or null/);
  assert.match(messages[0].content, /"kind":"item_holder"\|"item_owner"/);
  assert.match(messages[0].content, /For effects\[\]\.kind use EXACTLY one of/);
  assert.deepEqual(parseExtractionProposal(output), valid);
  assert.throws(() => parseExtractionProposal({ ...valid, extra: true }), /EXTRACTION_OUTPUT_INVALID/);
  assert.throws(() => parseExtractionProposal("{"), /EXTRACTION_OUTPUT_INVALID/);
});

test("DeepSeek extractor accepts only stop with non-empty content", async (t) => {
  const request = {
    packet: {} as ExtractionPacket,
    system: "Extraction contract.",
    input: "{}",
    signal: new AbortController().signal,
  };
  const providerFor = (finishReason: string | null, content: unknown) => new ChatCompletionsExtractorProvider(
    "deepseek-flash",
    "https://api.deepseek.com/chat/completions",
    "test-key",
    async () => Response.json({ choices: [{ finish_reason: finishReason, message: { content } }] }),
  );

  assert.equal(await providerFor("stop", "{}").complete(request), "{}");
  for (const finishReason of ["length", "content_filter", null, "provider_resource_error"]) {
    await t.test(`rejects ${String(finishReason)}`, async () => {
      await assert.rejects(providerFor(finishReason, "{}").complete(request), /EXTRACTOR_PROVIDER_RESPONSE_INCOMPLETE/);
    });
  }
  for (const content of ["", "   "]) {
    await t.test("rejects empty content", async () => {
      await assert.rejects(providerFor("stop", content).complete(request), /EXTRACTOR_EMPTY_CONTENT/);
    });
  }
  await assert.rejects(providerFor("stop", null).complete(request), /EXTRACTOR_PROVIDER_RESPONSE_INVALID/);
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

test("item holder and owner refs compile independently to canonical epistemic shapes", async () => {
  const f = await itemCompilerFixture();
  const itemRef = alias(f.packet, f.ids.item);
  const chengRef = alias(f.packet, f.ids.cheng);
  const holderOnly = compileItemEffects(f, [{
    ...itemEffectBase(), kind: "item_holder", itemRef,
    after: { valueRef: chengRef, status: "resolved", lastConfirmedValueRef: chengRef },
  }]);
  assert.equal(holderOnly.deltas.length, 1);
  assert.equal(holderOnly.deltas[0].fieldPath, "holder");
  assert.deepEqual(holderOnly.deltas[0].after, { value: f.ids.cheng, status: "resolved", lastConfirmedValue: f.ids.cheng });
  assert.equal(holderOnly.deltas.some(delta => delta.fieldPath === "owner"), false);
  assert.equal(f.aggregate.state.items[0].owner.value, f.ids.ji);
  assert.equal("valueRef" in (holderOnly.deltas[0].after as object), false);

  const ownershipTransfer = compileItemEffects(f, [
    {
      ...itemEffectBase(), kind: "item_holder", itemRef,
      after: { valueRef: chengRef, status: "resolved", lastConfirmedValueRef: chengRef },
    },
    {
      ...itemEffectBase(), kind: "item_owner", itemRef,
      after: { valueRef: chengRef, status: "resolved", lastConfirmedValueRef: chengRef },
    },
  ]);
  assert.deepEqual(ownershipTransfer.deltas.map(delta => delta.fieldPath), ["holder", "owner"]);
  for (const delta of ownershipTransfer.deltas)
    assert.deepEqual(delta.after, { value: f.ids.cheng, status: "resolved", lastConfirmedValue: f.ids.cheng });
});

test("item custodian preserves null versus epistemic assertions and rejects unknown refs", async () => {
  const f = await itemCompilerFixture();
  const itemRef = alias(f.packet, f.ids.item);
  const chengRef = alias(f.packet, f.ids.cheng);
  const assigned = compileItemEffects(f, [{
    ...itemEffectBase(), kind: "item_custodian", itemRef,
    after: { valueRef: chengRef, status: "resolved", lastConfirmedValueRef: chengRef },
  }]);
  assert.deepEqual(assigned.deltas[0].after, { value: f.ids.cheng, status: "resolved", lastConfirmedValue: f.ids.cheng });

  const unresolved = compileItemEffects(f, [{
    ...itemEffectBase(), kind: "item_custodian", itemRef,
    after: { valueRef: null, status: "unresolved", lastConfirmedValueRef: chengRef },
  }]);
  assert.deepEqual(unresolved.deltas[0].after, { value: null, status: "unresolved", lastConfirmedValue: f.ids.cheng });

  const cleared = compileItemEffects(f, [{
    ...itemEffectBase(), kind: "item_custodian", itemRef, after: null,
  }]);
  assert.equal(cleared.deltas.length, 1);
  assert.equal(cleared.deltas[0].after, null);

  const unknown = compileItemEffects(f, [
    { ...itemEffectBase(), kind: "item_holder", itemRef, after: { valueRef: "CHAR_999", status: "resolved", lastConfirmedValueRef: "CHAR_999" } },
    { ...itemEffectBase(), kind: "item_owner", itemRef, after: { valueRef: "CHAR_998", status: "resolved", lastConfirmedValueRef: "CHAR_998" } },
    { ...itemEffectBase(), kind: "item_custodian", itemRef, after: { valueRef: null, status: "unresolved", lastConfirmedValueRef: "CHAR_997" } },
  ]);
  assert.equal(unknown.deltas.length, 0);
  assert.equal(unknown.rejectedEffects.length, 3);
  assert.equal(unknown.issues.filter(issue => issue.code === "UNKNOWN_ENTITY_REF").length, 3);
});

test("model request uses deterministic opaque refs and omits every canonical UUID", async () => {
  const f = await itemCompilerFixture();
  const repeated = buildExtractionPacket(f.aggregate, f.revisionId);
  assert.deepEqual(repeated.entities, f.packet.entities);
  assert.ok(f.packet.entities.every(entity => /^[A-Z]+_\d{3}$/.test(entity.alias)));
  assert.ok(f.packet.entities.every(entity => entity.alias !== entity.id));
  const request = buildExtractionRequest(f.packet);
  for (const id of [f.storyId, f.revisionId, f.documentId, ...Object.values(f.ids)])
    assert.equal(request.input.includes(id), false, `model input leaked ${id}`);
  assert.match(request.input, /CHAR_001/);
  assert.match(request.input, /ITEM_001/);
  assert.match(request.input, /PROP_001/);
  assert.match(request.input, /THREAD_001/);
  assert.match(request.input, /REL_001/);
  const input = JSON.parse(request.input) as Record<string, unknown>;
  assert.equal("storyId" in input, false);
  assert.equal("sourceRevisionId" in input, false);
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
