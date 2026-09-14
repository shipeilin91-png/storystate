import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { StateService } from "../lib/server/state-service";
import { respond, storyRequest } from "../lib/server/api";
import { RuntimeValidator } from "../lib/server/validator/runtime-validator";
import { deterministicGate } from "../lib/server/validator/deterministic";
import { PACKET_LIMITS, StructuredValidationContextProvider } from "../lib/server/validator/context";
import { aggregateChecks } from "../lib/server/validator/aggregate";
import { ChatCompletionsSemanticClient, parseSemanticOutput, routeAgents, UnavailableSemanticModelClient, ValidationOrchestrator } from "../lib/server/validator/semantic";
import type { StateDelta, TargetType } from "../lib/domain/state";
import { accept, epistemic, openRepository, proposal } from "./helpers/backend";
import { FakeSemanticClient, runtimeFixture, supported, withoutValidatorResults } from "./fixtures/runtime-validator";

const context = new StructuredValidationContextProvider();
test("deterministic gate reuses contract logic, rejects invalid inputs and short-circuits agents", async (t) => {
  const f = await runtimeFixture(), a = await f.repository.read(f.storyId);
  const cases: [string, Partial<StateDelta>, string][] = [
    ["unknown field", { fieldPath: "invented" }, "failed"],
    ["invalid operation", { operation: "DELETE" as StateDelta["operation"] }, "failed"],
    ["stale before", { before: epistemic(f.ids.Gu) }, "conflict"],
    ["invalid reference", { after: epistemic(randomUUID()) }, "failed"],
    ["NO_CHANGE must not mutate", { operation: "NO_CHANGE" }, "failed"],
    ["missing target", { targetId: randomUUID() }, "failed"],
    ["bad create", { operation: "CREATE" }, "failed"],
    ["missing event effect", { effect: null }, "failed"],
    ["missing evidence", { evidenceIds: [] }, "failed"],
  ];
  for (const [name, patch, terminal] of cases) await t.test(name, async () => {
    assert.equal(deterministicGate(a, { ...f.delta, ...patch }, 1).terminal, terminal);
  });
  assert.equal(deterministicGate(a, f.delta, 0).terminal, "conflict");
  const client = new FakeSemanticClient();
  const result = await new RuntimeValidator(f.repository, client).validate(f.storyId, f.delta.id, 0);
  assert.equal(result.recommendation, "CONFLICT"); assert.equal(client.requests.length, 0);
  await assert.rejects(accept(f.service, f.storyId, f.delta.id), /conflict/i);
});

test("failed reference returns REJECT, cannot be accepted or committed after repository forgery", async () => {
  const f = await runtimeFixture(), client = new FakeSemanticClient();
  const bad = await f.service.proposeDelta(f.storyId, { ...f.input, after: epistemic(randomUUID()) });
  const result = await new RuntimeValidator(f.repository, client).validate(f.storyId, bad.id, 1);
  assert.equal(result.status, "failed"); assert.equal(result.recommendation, "REJECT"); assert.equal(client.requests.length, 0);
  await assert.rejects(accept(f.service, f.storyId, bad.id), /prohibits/);
  await f.repository.transaction(f.storyId, a => { a.deltas.find(d => d.id === bad.id)!.decision = "accepted"; });
  await assert.rejects(f.service.commitAcceptedDeltas(f.storyId, { deltaIds: [bad.id], expectedVersion: 1 }), /prohibits/);
});

test("CREATE, lifecycle, knowledge representation and correction provenance use existing contracts", async () => {
  const f = await runtimeFixture("Ch17-B"), a = await f.repository.read(f.storyId);
  const after = f.delta.after as Record<string, unknown>;
  for (const patch of [{ ...after, stance: "corrected" }, { ...after, believedValue: null }, { ...after, basis: humanBasis() }])
    assert.equal(deterministicGate(a, { ...f.delta, after: patch }, 1).terminal, "failed");
  const char = a.state.characters[0], newId = randomUUID();
  const fresh = { ...f.delta, ...proposal("characters", newId, null, { ...char, id: newId }), id: randomUUID() };
  assert.equal(deterministicGate(a, fresh, 1).terminal, null);
  assert.equal(deterministicGate(a, { ...fresh, targetId: char.id, after: char }, 1).terminal, "conflict");
  const retire = { ...f.delta, ...proposal("characters", char.id, char, { ...char, active: false }, "$", { operation: "INVALIDATE" }) };
  assert.equal(deterministicGate(a, retire, 1).terminal, "failed", "Referenced character cannot be retired");
});
function humanBasis() { return { kinds: ["human_confirmation"], note: "Explicit human correction" }; }

test("NO_CHANGE is audited but still cannot create a state version", async () => {
  const f = await runtimeFixture(), d = await f.service.proposeDelta(f.storyId, { ...f.input, operation: "NO_CHANGE", after: f.input.before });
  const result = await f.service.validateDelta(f.storyId, d.id, { expectedVersion: 1 });
  assert.equal(result.recommendation, "AUTO_ACCEPT_ELIGIBLE");
  await accept(f.service, f.storyId, d.id);
  await assert.rejects(f.service.commitAcceptedDeltas(f.storyId, { deltaIds: [d.id], expectedVersion: 1 }), /real canonical mutation/);
});

test("deterministic routing includes whole-record mutations and owner without calling every specialist", async () => {
  const f = await runtimeFixture(), packet = context.build(await f.repository.read(f.storyId), f.delta);
  for (const [type, field, expected] of [
    ["knowledge", "$", ["evidence", "knowledge_boundary", "temporal_state"]],
    ["characters", "location", ["evidence", "temporal_state"]], ["characters", "$", ["evidence", "temporal_state"]],
    ["characters", "role", ["evidence"]], ["items", "owner", ["evidence", "temporal_state"]],
    ["items", "custodian", ["evidence", "temporal_state"]], ["items", "condition", ["evidence", "temporal_state"]],
    ["worldTruth", "status", ["evidence", "temporal_state"]], ["plotThreads", "$", ["evidence", "temporal_state"]],
    ["relationships", "$", ["evidence"]], ["propositions", "$", ["evidence"]],
  ] as const) assert.deepEqual(routeAgents({ ...packet, candidateDelta: { ...packet.candidateDelta, targetType: type as TargetType, fieldPath: field } }), expected);
});

test("strict output parsing rejects unknown citations, wrong agent, confidence, prose and missing grounding", async () => {
  const f = await runtimeFixture(), packet = context.build(await f.repository.read(f.storyId), f.delta);
  const valid = { agent: "evidence", verdict: "SUPPORTED", reason: "The handoff supports possession.", evidenceIds: [f.evidenceIds[0]] };
  assert.deepEqual(parseSemanticOutput(JSON.stringify(valid), "evidence", packet), valid);
  for (const invalid of [
    { ...valid, evidenceIds: [randomUUID()] }, { ...valid, evidenceIds: [] },
    { ...valid, evidenceIds: [f.evidenceIds[0], f.evidenceIds[0]] }, { ...valid, agent: "temporal_state" },
    { ...valid, confidence: 0.9 }, { ...valid, verdict: "ACCEPT" },
    { ...valid, reason: "x".repeat(601) }, "```json\n{}\n```", "{",
  ]) assert.throws(() => parseSemanticOutput(invalid, "evidence", packet));
});

test("UNSUPPORTED/UNCERTAIN, provider failures and partial failures never become REJECT or false AUTO_ACCEPT", async (t) => {
  for (const mode of ["unsupported", "uncertain", "failure", "partial", "parse", "timeout"] as const) await t.test(mode, async () => {
    const client = new FakeSemanticClient(async request => {
      if (mode === "failure" || (mode === "partial" && request.agent === "temporal_state")) throw new Error("secret-provider-message");
      if (mode === "parse") return { ...supported(request), evidenceIds: [randomUUID()] };
      if (mode === "timeout") return new Promise(() => {});
      return { ...supported(request), verdict: mode === "unsupported" ? "UNSUPPORTED" : mode === "uncertain" ? "UNCERTAIN" : "SUPPORTED" };
    });
    const f = await runtimeFixture(), before = await f.repository.read(f.storyId);
    const result = await new RuntimeValidator(f.repository, client, context, 20).validate(f.storyId, f.delta.id, 1);
    assert.equal(result.status, "needs_review"); assert.equal(result.recommendation, "NEEDS_REVIEW");
    assert.ok(!JSON.stringify(result).includes("secret-provider-message"));
    assert.deepEqual(withoutValidatorResults(await f.repository.read(f.storyId)), withoutValidatorResults(before));
    assert.equal(client.requests.length, 2);
  });
});

test("aggregator requires every routed result exactly once and honors static impact", async () => {
  const f = await runtimeFixture(), a = await f.repository.read(f.storyId), packet = context.build(a, f.delta), gate = deterministicGate(a, f.delta, 1);
  const checks = await new ValidationOrchestrator(new FakeSemanticClient()).run(packet);
  assert.equal(aggregateChecks(gate, packet, routeAgents(packet), checks).recommendation, "AUTO_ACCEPT_ELIGIBLE");
  for (const broken of [[], checks.slice(0, 1), [checks[0], checks[0]], [...checks, checks[0]]])
    assert.equal(aggregateChecks(gate, packet, routeAgents(packet), broken).recommendation, "NEEDS_REVIEW");
  for (const type of ["worldTruth", "relationships", "knowledge"] as const)
    assert.equal(aggregateChecks(gate, { ...packet, candidateDelta: { ...packet.candidateDelta, targetType: type } }, routeAgents(packet), checks).recommendation, "NEEDS_REVIEW");
});

test("context separates canonical truth, source evidence and bounded historical retrieval", async () => {
  const f = await runtimeFixture("Ch15-B"), a = await f.repository.read(f.storyId);
  const linkedId = randomUUID();
  a.evidence.push({ ...a.evidence[0], id: linkedId });
  a.events[0].evidenceIds.push(linkedId);
  const hiddenRevision = { ...a.revisions[0], id: randomUUID(), visibility: "author_only" as const, revisionNumber: 2, content: "hidden_author_truth=false" };
  a.revisions.push(hiddenRevision);
  const hidden = { ...a.evidence[0], id: randomUUID(), sourceRevisionId: hiddenRevision.id, quote: hiddenRevision.content, start: 0, end: hiddenRevision.content.length };
  a.evidence.push(hidden); a.events[0].evidenceIds.push(hidden.id);
  const rejectedOnly = { ...a.evidence[0], id: randomUUID() };
  a.evidence.push(rejectedOnly);
  a.deltas.push({ ...f.delta, id: randomUUID(), decision: "rejected", evidenceIds: [rejectedOnly.id] });
  const otherTypeEvidence = { ...a.evidence[0], id: randomUUID() };
  a.evidence.push(otherTypeEvidence);
  a.deltas.push({ ...f.delta, id: randomUUID(), targetType: "characters", decision: "accepted", committedVersionId: randomUUID(), evidenceIds: [otherTypeEvidence.id] });
  const packet = context.build(a, f.delta);
  assert.deepEqual(packet.primaryEvidence.map(e => e.id), f.evidenceIds);
  assert.ok(packet.retrievedEvidence.some(e => e.id === linkedId));
  assert.ok(!packet.retrievedEvidence.some(e => e.id === hidden.id || e.id === rejectedOnly.id));
  assert.ok(!packet.retrievedEvidence.some(e => e.id === otherTypeEvidence.id), "Same ID in another target type is unrelated");
  assert.ok(!JSON.stringify(packet).includes("hidden_author_truth"));
  assert.ok(!("confidence" in packet.candidateDelta));
  assert.equal(packet.currentStateSlice.knowledge.find(k => k.id === f.ids.GuF)?.stance, "unaware");
  assert.equal(packet.currentStateSlice.knowledge.find(k => k.id === f.ids.GuR)?.stance, "knows");
  assert.ok(packet.currentStateSlice.propositions.some(p => p.id === f.ids.F));
  assert.ok(packet.currentStateSlice.propositions.some(p => p.id === f.ids.R));
  assert.ok(Buffer.byteLength(JSON.stringify(packet)) <= PACKET_LIMITS.bytes);
});

test("context limits and superseded primary evidence stop semantic calls without fake support", async () => {
  const f = await runtimeFixture(), client = new FakeSemanticClient();
  await f.service.addSourceRevision(f.storyId, { id: randomUUID(), documentId: f.docId, revisionNumber: 2, content: "Rewritten source", visibility: "canonical" });
  const result = await new RuntimeValidator(f.repository, client).validate(f.storyId, f.delta.id, 1);
  assert.equal(result.recommendation, "NEEDS_REVIEW"); assert.equal(client.requests.length, 0);
  const a = await f.repository.read(f.storyId);
  assert.throws(() => context.build(a, { ...f.delta, evidenceIds: Array(13).fill(f.evidenceIds[0]) }), /limit/);
});

test("in-flight canonical/evidence/decision updates discard stale model results", async (t) => {
  for (const kind of ["state", "revision", "decision", "competing"] as const) await t.test(kind, async () => {
    const f = await runtimeFixture();
    let signalStarted!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    const client = new FakeSemanticClient(async request => { signalStarted(); await wait; return supported(request); });
    const running = new RuntimeValidator(f.repository, client).validate(f.storyId, f.delta.id, 1);
    await started;
    if (kind === "state") {
      const d = await f.service.proposeDelta(f.storyId, proposal("characters", f.ids.Chen, epistemic("Hospital"), epistemic("Dock"), "location"));
      await accept(f.service, f.storyId, d.id);
      await f.service.commitAcceptedDeltas(f.storyId, { deltaIds: [d.id], expectedVersion: 1 });
    } else if (kind === "revision") await f.service.addSourceRevision(f.storyId, { id: randomUUID(), documentId: f.docId, revisionNumber: 2, content: "Rewrite", visibility: "canonical" });
    else if (kind === "decision") await f.service.decideDelta(f.storyId, f.delta.id, { decision: "deferred", actor: "human", reason: "Wait" });
    else {
      const d = await f.service.proposeDelta(f.storyId, { ...f.input, after: epistemic(f.ids.Gu) });
      await accept(f.service, f.storyId, d.id);
    }
    release();
    await assert.rejects(running, /inputs changed/);
    assert.equal((await f.service.getDeltas(f.storyId)).find(d => d.id === f.delta.id)?.validatorResult, null);
  });
});

for (const adapter of ["memory", "postgres"] as const) test(`${adapter}: API validation persists checks/audit only; legacy results still readable`, async () => {
  const { repository, close } = await openRepository(adapter);
  try {
    const client = new FakeSemanticClient(), f = await runtimeFixture("Ch13-A", repository, client), before = await repository.read(f.storyId);
    const response = await respond(() => storyRequest(f.service, "POST", f.storyId, ["deltas", f.delta.id, "validate"], new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) })));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.recommendation, "AUTO_ACCEPT_ELIGIBLE");
    const after = await repository.read(f.storyId), saved = after.deltas.find(d => d.id === f.delta.id)!.validatorResult!;
    assert.deepEqual(saved, result);
    assert.equal(saved.checks?.length, 3);
    assert.equal(saved.validatorVersion, "runtime-validator/0.1");
    assert.equal(saved.evaluatedAgainstVersion, 1);
    assert.equal(saved.evaluatedAgainstStoryRevision, 1);
    assert.match(saved.packetHash!, /^[a-f0-9]{64}$/);
    assert.deepEqual(withoutValidatorResults(after), withoutValidatorResults(before));
    await f.service.setValidatorResult(f.storyId, f.delta.id, { status: "passed", risk: "LOW", recommendation: "AUTO_ACCEPT_ELIGIBLE", reason: "Legacy result" });
    assert.equal((await repository.read(f.storyId)).deltas.find(d => d.id === f.delta.id)?.validatorResult?.checks, undefined);
    await accept(f.service, f.storyId, f.delta.id);
    await f.service.commitAcceptedDeltas(f.storyId, { deltaIds: [f.delta.id], expectedVersion: 1 });
    await assert.rejects(f.service.validateDelta(f.storyId, f.delta.id, { expectedVersion: 2 }), /immutable/);
  } finally { await close(); }
});

test("unconfigured model produces review checks, not supported results", async () => {
  const f = await runtimeFixture();
  const service = new StateService(f.repository, new UnavailableSemanticModelClient());
  const result = await service.validateDelta(f.storyId, f.delta.id, { expectedVersion: 1 });
  assert.equal(result.recommendation, "NEEDS_REVIEW");
  assert.equal(result.modelId, "unconfigured");
  assert.ok(result.checks!.filter(c => c.agent !== "deterministic").every(c => c.verdict === "UNCERTAIN"));
});

test("retrieval is bounded, deduplicated and future evidence is excluded", async () => {
  const f = await runtimeFixture(), a = await f.repository.read(f.storyId);
  for (let index = 0; index < 20; index++) {
    const id = randomUUID();
    a.evidence.push({ ...a.evidence[0], id });
    a.events[0].evidenceIds.push(id);
  }
  const futureId = randomUUID(), docId = randomUUID(), revisionId = randomUUID();
  a.documents.push({ id: docId, sourceOrder: 17, chapter: 17, title: "Future" });
  a.revisions.push({ id: revisionId, documentId: docId, revisionNumber: 1, content: "Future disclosure", visibility: "canonical" });
  a.evidence.push({ id: futureId, sourceRevisionId: revisionId, quote: "Future disclosure", start: 0, end: 17, speakerId: null });
  a.events.push({ ...a.events[0], id: randomUUID(), sourceRevisionId: revisionId, sourceOrder: 17, evidenceIds: [futureId] });
  const packet = context.build(a, f.delta);
  assert.equal(packet.retrievedEvidence.length, PACKET_LIMITS.retrieved);
  assert.ok(packet.provenance.retrievalTruncated);
  assert.ok(!packet.retrievedEvidence.some(e => e.id === futureId));
  assert.equal(new Set([...packet.primaryEvidence, ...packet.retrievedEvidence].map(e => e.id)).size, packet.primaryEvidence.length + packet.retrievedEvidence.length);
  const checks = await new ValidationOrchestrator(new FakeSemanticClient()).run(packet);
  assert.equal(aggregateChecks(deterministicGate(a, f.delta, 1), packet, routeAgents(packet), checks).recommendation, "NEEDS_REVIEW");
});

test("future intent and historical location are semantic review, never hard REJECT", async (t) => {
  for (const text of ["明天去北堤。", "三天前到过 C-19。"]) await t.test(text, async () => {
    const client = new FakeSemanticClient(request => ({ ...supported(request), verdict: request.agent === "temporal_state" ? "UNSUPPORTED" : "SUPPORTED" }));
    const f = await runtimeFixture("Ch17-A", undefined, client);
    const docId = randomUUID(), revisionId = randomUUID(), evidenceId = randomUUID();
    await f.service.addSourceDocument(f.storyId, { id: docId, title: "Temporal negative", sourceOrder: 18, chapter: 18 });
    await f.service.addSourceRevision(f.storyId, { id: revisionId, documentId: docId, revisionNumber: 1, content: text, visibility: "canonical" });
    await f.service.addEvidence(f.storyId, { id: evidenceId, sourceRevisionId: revisionId, quote: text, start: 0, end: text.length, speakerId: null });
    const event = await f.service.appendEvent(f.storyId, { sourceRevisionId: revisionId, sourceOrder: 18, storyTime: null, eventType: "reported", summary: "Historical or intended movement", participantIds: [f.ids.Father], evidenceIds: [evidenceId], payload: {} });
    const d = await f.service.proposeDelta(f.storyId, { ...f.input, sourceEventId: event.id, evidenceIds: [evidenceId], after: epistemic(text.startsWith("明天") ? "North Embankment" : "C-19") });
    const result = await f.service.validateDelta(f.storyId, d.id, { expectedVersion: 1 });
    assert.equal(result.recommendation, "NEEDS_REVIEW");
    assert.equal(result.checks!.find(c => c.agent === "temporal_state")?.verdict, "UNSUPPORTED");
    assert.deepEqual((await f.service.getCurrentState(f.storyId)).state.characters.find(c => c.id === f.ids.Father)?.location, epistemic(null));
  });
});

test("optional provider adapter sends one structured request without tools and rejects truncation", async () => {
  const f = await runtimeFixture(), packet = context.build(await f.repository.read(f.storyId), f.delta);
  let body: Record<string, unknown> = {};
  const transport: typeof fetch = async (_url, init) => {
    body = JSON.parse(init!.body as string);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ agent: "evidence", verdict: "SUPPORTED", reason: "Direct handoff.", evidenceIds: [f.evidenceIds[0]] }) } }] });
  };
  const client = new ChatCompletionsSemanticClient("test-model", "https://example.invalid/chat/completions", "test-key", transport);
  const checks = await new ValidationOrchestrator(client).run(packet, ["evidence"]);
  assert.equal(checks[0].verdict, "SUPPORTED");
  assert.equal(body.temperature, 0); assert.equal(body.n, 1);
  assert.ok(!("tools" in body));
  assert.equal((body.response_format as { type: string }).type, "json_schema");
  const broken = new ChatCompletionsSemanticClient("test-model", "https://example.invalid/chat/completions", "test-key", async () =>
    Response.json({ choices: [{ finish_reason: "length", message: { content: "{}" } }] }));
  assert.equal((await new ValidationOrchestrator(broken).run(packet, ["evidence"]))[0].verdict, "UNCERTAIN");
});

test("invalidated assertion evidence and unrelated soft content are not retrieval authority", async () => {
  const f = await runtimeFixture(), a = await f.repository.read(f.storyId), discardedId = randomUUID();
  a.evidence.push({ ...a.evidence[0], id: discardedId });
  a.events[0].evidenceIds.push(discardedId);
  const targetId = randomUUID();
  a.deltas.push({ ...f.delta, id: randomUUID(), targetId, committedVersionId: randomUUID(), decision: "accepted", evidenceIds: [discardedId] });
  a.deltas.push({ ...f.delta, id: randomUUID(), targetId, operation: "INVALIDATE", committedVersionId: randomUUID(), decision: "accepted", evidenceIds: [] });
  a.annotations.push({ id: randomUUID(), sourceRevisionId: f.revisionId, targetType: "items", targetId: f.ids.USB, evidenceIds: [discardedId],
    content: "LLM speculation must not be authoritative", confidence: 1, basis: { kinds: ["inference"], note: "Soft" }, scope: {}, createdAt: new Date().toISOString(), invalidatedAt: null, supersededBy: null });
  const packet = context.build(a, f.delta);
  assert.ok(!packet.retrievedEvidence.some(e => e.id === discardedId));
  assert.ok(!JSON.stringify(packet).includes("LLM speculation"));
});

test("newer validation result cannot be overwritten by an older in-flight model run", async () => {
  const f = await runtimeFixture();
  let start!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { start = resolve; });
  const pause = new Promise<void>(resolve => { release = resolve; });
  const slow = new FakeSemanticClient(async request => { start(); await pause; return supported(request); });
  const older = new RuntimeValidator(f.repository, slow).validate(f.storyId, f.delta.id, 1);
  await started;
  const latest = await new RuntimeValidator(f.repository, new UnavailableSemanticModelClient()).validate(f.storyId, f.delta.id, 1);
  release();
  await assert.rejects(older, /inputs changed/);
  assert.deepEqual((await f.repository.read(f.storyId)).deltas.find(d => d.id === f.delta.id)?.validatorResult, latest);
});
