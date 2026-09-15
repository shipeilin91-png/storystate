import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FinishReason, type GenerateContentParameters } from "@google/genai";
import { digest } from "../lib/eval/contract";
import { buildLivePreflight } from "../lib/eval/live/preflight";
import { executionSummarySchema, rawResultRecordSchema, writeLiveArtifactBundle } from "../lib/eval/live/artifacts";
import {
  assertAuthorizedManifest, assertB0ExecutionDisabled, assertPreparedManifest, readPreparedManifest,
  REVIEWED_PRE_LIVE_FROZEN_COMMIT,
} from "../lib/eval/live/manifest";
import {
  buildGeminiRequest, createGeminiEvalClient, GEMINI_CANDIDATE_MODELS, serializeGeminiRequestForBudget,
  type GeminiResponse, type GeminiTransport,
} from "../lib/eval/providers/gemini";
import {
  datasetHash, decoding, evaluationConfigHash, genericPrompt, parseGeneric, responseSchemaFor, runEvaluation,
  type EvalAgent, type EvalRequest,
} from "../lib/eval/runner";
import { specialistPrompts } from "../lib/server/validator/semantic";
import { buildBenchmark, benchmarkFingerprint, sourceDigest } from "./fixtures/live-semantic-benchmark";

const lock = JSON.parse(readFileSync("tests/fixtures/live-semantic-benchmark.lock.json", "utf8"));
const casesPromise = buildBenchmark();
const expectedVersion = "gemini-2.5-flash-001";

class FakeTransport implements GeminiTransport {
  requests: GenerateContentParameters[] = [];
  constructor(private readonly response: (request: GenerateContentParameters, index: number) => GeminiResponse) {}
  async generateContent(request: GenerateContentParameters) {
    this.requests.push(request);
    return this.response(request, this.requests.length - 1);
  }
}

function packetFrom(request: GenerateContentParameters) {
  const content = (request.contents as Array<{ parts: Array<{ text?: string }> }>)[0];
  return JSON.parse(content.parts[0].text!).validationPacket;
}

function validResponse(request: GenerateContentParameters, version = expectedVersion, usage = true): GeminiResponse {
  const packet = packetFrom(request);
  const system = request.config?.systemInstruction;
  const agent = system === genericPrompt ? "generic" :
    Object.entries(specialistPrompts).find(([, prompt]) => prompt === system)?.[0] ?? "generic";
  return {
    text: JSON.stringify({
      agent,
      verdict: "SUPPORTED",
      reason: "Sanitized fake transport response.",
      evidenceIds: packet.primaryEvidence.map((evidence: { id: string }) => evidence.id),
    }),
    modelVersion: version,
    responseId: "fake-response-id",
    usageMetadata: usage ? { promptTokenCount: 123, candidatesTokenCount: 17 } : undefined,
    candidates: [{ finishReason: FinishReason.STOP }],
  };
}

async function evalRequest(agent: EvalAgent = "generic"): Promise<EvalRequest> {
  const benchmarkCase = (await casesPromise)[0];
  return {
    agent,
    system: agent === "generic" ? genericPrompt : specialistPrompts[agent],
    packet: benchmarkCase.packet,
    identity: { provider: "google-gemini-developer-api", modelId: "gemini-2.5-flash", modelVersion: expectedVersion },
    decoding,
    responseSchema: responseSchemaFor(agent),
    signal: new AbortController().signal,
  };
}

function client(transport: GeminiTransport, version = expectedVersion) {
  return createGeminiEvalClient({ requestedModelId: "gemini-2.5-flash", expectedResolvedModelVersion: version, transport });
}

test("Gemini adapter maps the frozen request into one structured generateContent request", async () => {
  const request = await evalRequest();
  const parameters = buildGeminiRequest(request, "gemini-2.5-flash");
  assert.equal(parameters.model, "gemini-2.5-flash");
  assert.deepEqual(packetFrom(parameters), request.packet);
  assert.equal(parameters.config?.systemInstruction, genericPrompt);
  assert.equal(parameters.config?.temperature, decoding.temperature);
  assert.equal(parameters.config?.maxOutputTokens, decoding.maxTokens);
  assert.equal(parameters.config?.candidateCount, 1);
  assert.equal(parameters.config?.responseMimeType, "application/json");
  assert.ok(parameters.config?.responseJsonSchema);
});

test("provider request contains no Gold, case, pair, group or rationale metadata", async () => {
  const serialized = serializeGeminiRequestForBudget(buildGeminiRequest(await evalRequest(), "gemini-2.5-flash"));
  for (const forbidden of ["goldSemanticVerdict", "goldFinalRouting", "caseId", "minimalPairs", "stabilitySelected", "fixtureReference", "rationale", "\"group\""])
    assert.ok(!serialized.includes(forbidden), forbidden);
});

test("provider request omits tools, search, URL context, code execution and function calling", async () => {
  const parameters = buildGeminiRequest(await evalRequest(), "gemini-2.5-flash");
  const serialized = serializeGeminiRequestForBudget(parameters);
  for (const forbidden of ["tools", "toolConfig", "googleSearch", "urlContext", "codeExecution", "functionDeclarations", "automaticFunctionCalling"])
    assert.ok(!serialized.includes(forbidden), forbidden);
});

test("structured Gemini response is still parsed by the existing StoryState parser", async () => {
  const transport = new FakeTransport(request => validResponse(request));
  const request = await evalRequest();
  const response = await client(transport).complete(request);
  assert.equal(parseGeneric(response.output, request.packet).verdict, "SUPPORTED");
  assert.equal(transport.requests.length, 1);
});

test("response modelVersion and provider metadata are captured rather than fabricated", async () => {
  const transport = new FakeTransport(request => validResponse(request, "gemini-actual-2026-09"));
  const response = await client(transport).complete(await evalRequest());
  assert.equal(response.resolvedIdentity?.modelVersion, "gemini-actual-2026-09");
  assert.notEqual(response.resolvedIdentity?.modelVersion, response.resolvedIdentity?.modelId);
  assert.deepEqual(response.providerMetadata, { responseId: "fake-response-id", finishReason: "STOP" });
});

test("usage maps promptTokenCount and candidatesTokenCount exactly", async () => {
  const transport = new FakeTransport(request => validResponse(request));
  assert.deepEqual((await client(transport).complete(await evalRequest())).usage, { inputTokens: 123, outputTokens: 17 });
});

test("missing or partial usage remains unavailable", async () => {
  const missing = new FakeTransport(request => validResponse(request, expectedVersion, false));
  assert.equal((await client(missing).complete(await evalRequest())).usage, null);
  const partial = new FakeTransport(request => ({ ...validResponse(request), usageMetadata: { promptTokenCount: 123 } }));
  assert.equal((await client(partial).complete(await evalRequest())).usage, null);
});

test("malformed provider output becomes a safe unavailable result", async () => {
  const cases = await casesPromise;
  const transport = new FakeTransport(() => ({ text: "{not-json", modelVersion: expectedVersion }));
  const run = await runEvaluation(cases, client(transport), {
    expectedDatasetHash: lock.datasetHash, expectedConfigHash: lock.evaluationConfigHash,
    allowLive: true, frozenCommit: REVIEWED_PRE_LIVE_FROZEN_COMMIT,
  });
  assert.ok(run.results.flatMap(result => result.calls).every(call => call.error === "SEMANTIC_UNAVAILABLE"));
  assert.ok(run.results.every(result => result.finalRouting !== "AUTO_ACCEPT_ELIGIBLE"));
});

test("provider errors are sanitized and never expose an API key", async () => {
  const key = "test-secret-gemini-key";
  const transport = new FakeTransport(() => { throw new Error(`upstream rejected ${key}`); });
  await assert.rejects(client(transport).complete(await evalRequest()), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "GEMINI_PROVIDER_ERROR");
    assert.ok(!error.message.includes(key));
    return true;
  });
});

test("provider model drift aborts through the existing runner identity guard", async () => {
  const transport = new FakeTransport(request => validResponse(request, "changed-version"));
  await assert.rejects(runEvaluation(await casesPromise, client(transport), {
    expectedDatasetHash: lock.datasetHash, expectedConfigHash: lock.evaluationConfigHash,
    allowLive: true, frozenCommit: REVIEWED_PRE_LIVE_FROZEN_COMMIT,
  }), /MODEL_IDENTITY_CHANGED/);
  assert.equal(transport.requests.length, 1);
});

test("adapter transport cannot mutate the frozen ValidationPacket", async () => {
  const request = await evalRequest(), before = digest(request.packet);
  const transport = new FakeTransport(parameters => {
    (parameters.contents as unknown[]).length = 0;
    return { text: "{}", modelVersion: expectedVersion };
  });
  await client(transport).complete(request);
  assert.equal(digest(request.packet), before);
});

test("tests use only injected fake transport and require no GEMINI_API_KEY", async () => {
  const transport = new FakeTransport(request => validResponse(request));
  await client(transport).complete(await evalRequest());
  assert.equal(transport.requests.length, 1);
});

test("offline preflight derives primary and stability call counts from frozen routing", async () => {
  const preflight = await buildLivePreflight();
  assert.deepEqual(preflight.calls.primary, { generic: 30, specialist: 69 });
  assert.deepEqual(preflight.calls.stability, { generic: 30, specialist: 69 });
  assert.equal(preflight.calls.total, 198);
  assert.equal(Object.values(preflight.calls.byAgent).reduce((sum, count) => sum + count, 0), 138);
  assert.equal(preflight.realProviderCalls, 0);
  assert.ok(preflight.requestSize.totalBytes > 0 && preflight.requestSize.maxBytes > 0);
  assert.match(preflight.roughLocalTokenBudgetEstimate.label, /NOT PROVIDER TOKEN COUNT/);
});

test("prepared manifest defaults fail closed with no selected model or authorization", () => {
  const manifest = readPreparedManifest();
  assert.doesNotThrow(() => assertPreparedManifest(manifest));
  assert.equal(manifest.status, "PREPARED_NOT_AUTHORIZED");
  assert.equal(manifest.requestedModelId, null);
  assert.equal(manifest.expectedResolvedModelVersion, null);
  assert.equal(manifest.authorizedAt, null);
  assert.equal(manifest.authorizedBy, null);
  assert.equal(GEMINI_CANDIDATE_MODELS.includes("gemini-3.1-flash-lite"), true);
});

test("missing authorization and the B0 execution boundary both reject live execution", () => {
  assert.throws(() => assertAuthorizedManifest(readPreparedManifest()), /LIVE_RUN_NOT_AUTHORIZED/);
  assert.throws(() => assertB0ExecutionDisabled(), /LIVE_RUN_NOT_AUTHORIZED/);
});

test("Gemini adapter cannot reach its transport without runner live authorization", async () => {
  const transport = new FakeTransport(request => validResponse(request));
  await assert.rejects(runEvaluation(await casesPromise, client(transport), {
    expectedDatasetHash: lock.datasetHash,
    expectedConfigHash: lock.evaluationConfigHash,
  }), /LIVE_RUN_NOT_AUTHORIZED/);
  assert.equal(transport.requests.length, 0);
});

test("raw result schema rejects missing provenance and accepts sanitized example", () => {
  const example = JSON.parse(readFileSync("tests/fixtures/live-semantic-raw-result.example.json", "utf8"));
  assert.doesNotThrow(() => rawResultRecordSchema.parse(example));
  const missing = structuredClone(example);
  delete missing.datasetHash;
  assert.throws(() => rawResultRecordSchema.parse(missing));
});

test("completed official artifact bundles cannot be silently overwritten", () => {
  const directory = mkdtempSync(join(tmpdir(), "storystate-live-artifacts-"));
  const prepared = readPreparedManifest();
  const manifest = {
    ...prepared, status: "AUTHORIZED" as const, requestedModelId: "gemini-2.5-flash" as const,
    expectedResolvedModelVersion: expectedVersion, authorizedAt: "2026-09-15T01:00:00.000Z", authorizedBy: "Product Owner",
  };
  const raw = rawResultRecordSchema.parse(JSON.parse(readFileSync("tests/fixtures/live-semantic-raw-result.example.json", "utf8")));
  const provenance = {
    experimentId: manifest.experimentId, benchmarkVersion: manifest.benchmarkVersion, datasetHash: manifest.datasetHash,
    evaluationConfigHash: manifest.evaluationConfigHash, reviewedFrozenCommit: manifest.reviewedFrozenCommit,
    provider: manifest.provider, requestedModelId: manifest.requestedModelId, resolvedModelVersion: expectedVersion,
  };
  const rawResults = Array.from({ length: manifest.expectedCallCount }, (_, index) => ({ ...raw, ...provenance, caseId: `SANITIZED-${index}` }));
  const summary = executionSummarySchema.parse({
    ...provenance, status: "COMPLETED", startedAt: "2026-09-15T01:00:00.000Z", finishedAt: "2026-09-15T02:00:00.000Z",
    expectedCallCount: manifest.expectedCallCount, completedCallCount: manifest.expectedCallCount, failedCallCount: 0, errorCategory: null,
  });
  const bundle = {
    manifest, rawResults, summary,
    metrics: { ...provenance, generatedAt: "2026-09-15T02:00:00.000Z", metrics: { semanticAccuracy: "sanitized" } },
    report: "# Sanitized report fixture",
  };
  try {
    writeLiveArtifactBundle(directory, bundle);
    assert.throws(() => writeLiveArtifactBundle(directory, bundle, { replaceIncomplete: true }), /COMPLETED_RUN_IMMUTABLE/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("raw live result directory is ignored by Git", () => {
  assert.doesNotThrow(() => execFileSync("git", ["check-ignore", "-q", "results/live-semantic/example/raw-results.jsonl"]));
});

test("Stage 2.2.1A benchmark and configuration freeze remain unchanged", async () => {
  const cases = await casesPromise;
  assert.equal(datasetHash(cases), lock.datasetHash);
  assert.equal(benchmarkFingerprint(cases), lock.benchmarkFingerprint);
  assert.equal(sourceDigest(), lock.sourceDigest);
  assert.equal(evaluationConfigHash(), lock.evaluationConfigHash);
  assert.equal(lock.realProviderCalls, 0);
});
