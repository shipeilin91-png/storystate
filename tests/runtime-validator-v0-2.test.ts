import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { aggregateChecks } from "../lib/server/validator/aggregate";
import { StructuredValidationContextProvider } from "../lib/server/validator/context";
import { deterministicGate } from "../lib/server/validator/deterministic";
import { genericSemanticPrompt } from "../lib/server/validator/generic-contract";
import { RuntimeValidator } from "../lib/server/validator/runtime-validator";
import { ChatCompletionsSemanticClient, GenericValidationOrchestrator, parseGenericSemanticOutput } from "../lib/server/validator/semantic";
import { genericPrompt } from "../lib/eval/runner";
import { FakeSemanticClient, runtimeFixture } from "./fixtures/runtime-validator";

const context = new StructuredValidationContextProvider();

test("V0.2 production makes one Generic call with the exact frozen prompt and audit", async () => {
  const client = new FakeSemanticClient(), f = await runtimeFixture("Ch13-A", undefined, client);
  const result = await f.service.validateDelta(f.storyId, f.delta.id, { expectedVersion: 1 });
  assert.equal(result.recommendation, "AUTO_ACCEPT_ELIGIBLE");
  assert.equal(client.requests.length, 1);
  assert.equal(client.requests[0].agent, "generic");
  assert.equal(client.requests[0].system, genericSemanticPrompt);
  assert.equal(genericSemanticPrompt, genericPrompt);
  assert.equal(result.validatorVersion, "runtime-validator/0.2");
  assert.equal(result.modelId, client.modelId);
  assert.equal(result.evaluatedAgainstVersion, 1);
  assert.equal(result.evaluatedAgainstStoryRevision, 1);
  assert.match(result.packetHash!, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.checks?.map(check => check.agent), ["deterministic", "generic"]);
});

test("Generic parser enforces strict shape, identity, citations and story-event grounding", async () => {
  const f = await runtimeFixture(), packet = context.build(await f.repository.read(f.storyId), f.delta);
  const valid = { agent: "generic", verdict: "SUPPORTED", reason: "The cited handoff supports the candidate.", evidenceIds: [f.evidenceIds[0]] };
  assert.deepEqual(parseGenericSemanticOutput(JSON.stringify(valid), packet), valid);
  for (const invalid of [
    { ...valid, agent: "evidence" },
    { ...valid, evidenceIds: [randomUUID()] },
    { ...valid, evidenceIds: [f.evidenceIds[0], f.evidenceIds[0]] },
    { ...valid, extra: true },
    { ...valid, verdict: "ACCEPT" },
    { ...valid, reason: "x".repeat(601) },
    { ...valid, evidenceIds: [] },
    "```json\n{}\n```",
    "{",
  ]) assert.throws(() => parseGenericSemanticOutput(invalid, packet));
});

test("all Generic parse failures become one sanitized unavailable check and safe review", async (t) => {
  const invalid = [
    "{",
    { agent: "evidence", verdict: "SUPPORTED", reason: "Wrong agent.", evidenceIds: [] },
    { agent: "generic", verdict: "SUPPORTED", reason: "Unknown citation.", evidenceIds: [randomUUID()] },
    { agent: "generic", verdict: "SUPPORTED", reason: "Duplicate citation.", evidenceIds: [] as string[] },
    { agent: "generic", verdict: "SUPPORTED", reason: "Extra field.", evidenceIds: [] as string[], extra: true },
    { agent: "generic", verdict: "ACCEPT", reason: "Invalid verdict.", evidenceIds: [] as string[] },
  ];
  for (const [index, output] of invalid.entries()) await t.test(String(index), async () => {
    const client = new FakeSemanticClient(() => output), f = await runtimeFixture("Ch13-A", undefined, client);
    if (index === 3 && typeof output === "object" && output && "evidenceIds" in output)
      output.evidenceIds = [f.evidenceIds[0], f.evidenceIds[0]];
    const result = await f.service.validateDelta(f.storyId, f.delta.id, { expectedVersion: 1 });
    assert.equal(client.requests.length, 1);
    assert.equal(result.recommendation, "NEEDS_REVIEW");
    assert.equal(result.status, "needs_review");
    assert.deepEqual(result.checks?.at(-1), {
      agent: "generic", verdict: "UNCERTAIN", reason: "Semantic check unavailable or invalid; human review required.", evidenceIds: [], code: "SEMANTIC_UNAVAILABLE",
    });
  });
});

test("SUPPORTED Generic result still applies every existing high-impact review rule", async () => {
  const f = await runtimeFixture(), aggregate = await f.repository.read(f.storyId);
  const packet = context.build(aggregate, f.delta), gate = deterministicGate(aggregate, f.delta, 1);
  const check = { agent: "generic" as const, verdict: "SUPPORTED" as const, reason: "Supported fixture.", evidenceIds: [f.evidenceIds[0]] };
  assert.equal(aggregateChecks(gate, packet, ["generic"], [check]).recommendation, "AUTO_ACCEPT_ELIGIBLE");
  const highImpact = [
    { targetType: "knowledge" as const },
    { targetType: "worldTruth" as const },
    { targetType: "relationships" as const },
    { targetType: "items" as const, fieldPath: "owner" },
    { targetType: "plotThreads" as const, fieldPath: "status", after: "resolved" },
  ];
  for (const patch of highImpact) {
    const candidate = { ...packet.candidateDelta, ...patch };
    assert.equal(aggregateChecks(gate, { ...packet, candidateDelta: candidate }, ["generic"], [check]).recommendation, "NEEDS_REVIEW");
  }
  assert.equal(aggregateChecks(gate, { ...packet, candidateDelta: { ...packet.candidateDelta, sourceKind: "human_correction" } }, ["generic"], [check]).recommendation, "NEEDS_REVIEW");
});

test("retrievalTruncated blocks AUTO after one supported Generic call", async () => {
  const client = new FakeSemanticClient(), f = await runtimeFixture("Ch13-A", undefined, client);
  const truncatedContext = { build: (aggregate: Parameters<typeof context.build>[0], delta: Parameters<typeof context.build>[1]) => {
    const packet = context.build(aggregate, delta);
    return { ...packet, provenance: { ...packet.provenance, retrievalTruncated: true } };
  } };
  const result = await new RuntimeValidator(f.repository, client, truncatedContext).validate(f.storyId, f.delta.id, 1);
  assert.equal(client.requests.length, 1);
  assert.equal(result.recommendation, "NEEDS_REVIEW");
});

test("provider-neutral adapter emits one bounded strict Generic request without tools", async () => {
  const f = await runtimeFixture(), packet = context.build(await f.repository.read(f.storyId), f.delta);
  let body: Record<string, unknown> = {}, calls = 0;
  const transport: typeof fetch = async (_url, init) => {
    calls++;
    body = JSON.parse(init!.body as string);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
      agent: "generic", verdict: "SUPPORTED", reason: "The cited handoff supports the candidate.", evidenceIds: [f.evidenceIds[0]],
    }) } }] });
  };
  const client = new ChatCompletionsSemanticClient("test-model", "https://example.invalid/chat/completions", "test-key", transport);
  const check = await new GenericValidationOrchestrator(client).run(packet);
  assert.equal(check.verdict, "SUPPORTED");
  assert.equal(calls, 1);
  assert.equal(body.temperature, 0);
  assert.equal(body.n, 1);
  assert.equal(body.max_tokens, 500);
  assert.ok(!("tools" in body));
  const format = body.response_format as { type: string; json_schema: { strict: boolean; schema: { properties: { agent: { const: string } } } } };
  assert.equal(format.type, "json_schema");
  assert.equal(format.json_schema.strict, true);
  assert.equal(format.json_schema.schema.properties.agent.const, "generic");
});

test("production source has no Specialist routing or fan-out dependency", async () => {
  const source = await readFile("lib/server/validator/runtime-validator.ts", "utf8");
  assert.ok(!source.includes("routeAgents"));
  assert.ok(!/\bValidationOrchestrator\b/.test(source));
  assert.ok(source.includes("GenericValidationOrchestrator"));
});
