import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest } from "../lib/eval/contract";
import { executionSummarySchema, rawResultRecordSchema, writeLiveArtifactBundle } from "../lib/eval/live/artifacts";
import {
  assertDeepSeekProbeDisabled,
  buildDeepSeekProbeRequest,
  parseDeepSeekProbeResponse,
  SYNTHETIC_PROBE_PACKET,
  SYNTHETIC_PROBE_QUOTE,
} from "../lib/eval/live/deepseek-probe";
import { buildLivePreflight } from "../lib/eval/live/preflight";
import {
  assertAuthorizedManifest,
  assertB0ExecutionDisabled,
  assertPreparedManifest,
  readPreparedManifest,
  REVIEWED_PRE_LIVE_FROZEN_COMMIT,
} from "../lib/eval/live/manifest";
import {
  buildDeepSeekRequest,
  createDeepSeekEvalClient,
  createOfficialDeepSeekTransport,
  DEEPSEEK_PROVIDER,
  DEEPSEEK_REQUESTED_MODEL,
  mapDeepSeekResponse,
  serializeDeepSeekRequestForBudget,
  type DeepSeekRequest,
  type DeepSeekResponse,
  type DeepSeekTransport,
} from "../lib/eval/providers/deepseek";
import {
  datasetHash,
  decoding,
  evaluationConfigHash,
  genericPrompt,
  parseGeneric,
  responseSchemaFor,
  runEvaluation,
  type EvalAgent,
  type EvalRequest,
} from "../lib/eval/runner";
import { specialistPrompts } from "../lib/server/validator/semantic";
import { buildBenchmark, benchmarkFingerprint, sourceDigest } from "./fixtures/live-semantic-benchmark";

const lock = JSON.parse(readFileSync("tests/fixtures/live-semantic-benchmark.lock.json", "utf8"));
const casesPromise = buildBenchmark();
const expectedVersion = "deepseek-actual-version-from-probe";

class FakeTransport implements DeepSeekTransport {
  requests: DeepSeekRequest[] = [];
  constructor(private readonly response: (request: DeepSeekRequest, index: number) => DeepSeekResponse) {}
  async createResponse(request: DeepSeekRequest) {
    this.requests.push(request);
    return this.response(request, this.requests.length - 1);
  }
}

function packetFrom(request: DeepSeekRequest) {
  return JSON.parse(request.input).validationPacket;
}

function validResponse(request: DeepSeekRequest, version = expectedVersion, usage = true): DeepSeekResponse {
  const packet = packetFrom(request);
  const agent = request.instructions === genericPrompt
    ? "generic"
    : Object.entries(specialistPrompts).find(([, prompt]) => prompt === request.instructions)?.[0] ?? "generic";
  return {
    id: "response-fake-id",
    status: "completed",
    model: version,
    output: [{
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{
        type: "output_text",
        text: JSON.stringify({
          agent,
          verdict: "SUPPORTED",
          reason: "Sanitized fake transport response.",
          evidenceIds: packet.primaryEvidence.map((evidence: { id: string }) => evidence.id),
        }),
      }],
    }],
    usage: usage ? {
      input_tokens: 123,
      output_tokens: 17,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 140,
    } : undefined,
    incomplete_details: null,
  };
}

async function evalRequest(agent: EvalAgent = "generic"): Promise<EvalRequest> {
  const benchmarkCase = (await casesPromise)[0];
  return {
    agent,
    system: agent === "generic" ? genericPrompt : specialistPrompts[agent],
    packet: benchmarkCase.packet,
    identity: { provider: DEEPSEEK_PROVIDER, modelId: DEEPSEEK_REQUESTED_MODEL, modelVersion: expectedVersion },
    decoding,
    responseSchema: responseSchemaFor(agent),
    signal: new AbortController().signal,
  };
}

function client(transport: DeepSeekTransport, version = expectedVersion) {
  return createDeepSeekEvalClient({
    requestedModelId: DEEPSEEK_REQUESTED_MODEL,
    expectedResolvedModelVersion: version,
    transport,
  });
}

test("DeepSeek adapter maps the exact frozen non-thinking structured request", async () => {
  const request = await evalRequest();
  const parameters = buildDeepSeekRequest(request);
  assert.equal(parameters.model, "deepseek-flash");
  assert.equal(parameters.instructions, genericPrompt);
  assert.deepEqual(packetFrom(parameters), request.packet);
  assert.deepEqual(parameters.reasoning, { effort: "none" });
  assert.equal(parameters.temperature, 0);
  assert.equal(parameters.max_output_tokens, 500);
  assert.equal(parameters.text.format.type, "json_schema");
  assert.equal(parameters.text.format.name, "storystate_generic_semantic_check");
  assert.ok(parameters.text.format.schema);
});

test("specialist schema name is stable and contains no case identity", async () => {
  const parameters = buildDeepSeekRequest(await evalRequest("evidence"));
  assert.equal(parameters.text.format.name, "storystate_specialist_semantic_check");
  assert.ok(!parameters.text.format.name.includes("H01"));
});

test("provider request contains no Gold, group, pair, case or rationale metadata", async () => {
  const serialized = serializeDeepSeekRequestForBudget(buildDeepSeekRequest(await evalRequest()));
  for (const forbidden of ["goldSemanticVerdict", "goldFinalRouting", "caseId", "minimalPairs", "stabilitySelected", "fixtureReference", "rationale", "\"group\""])
    assert.ok(!serialized.includes(forbidden), forbidden);
});

test("provider request omits tools, searches, functions and conversation state", async () => {
  const parameters = buildDeepSeekRequest(await evalRequest());
  for (const forbidden of ["tools", "web_search", "functions", "previous_response_id", "conversation", "reflection", "retry"])
    assert.equal(Object.hasOwn(parameters, forbidden), false, forbidden);
});

test("assistant output_text is parsed by the existing StoryState parser", async () => {
  const transport = new FakeTransport(request => validResponse(request));
  const request = await evalRequest();
  const response = await client(transport).complete(request);
  assert.equal(parseGeneric(response.output, request.packet).verdict, "SUPPORTED");
  assert.equal(transport.requests.length, 1);
});

test("only assistant output_text is extracted", async () => {
  const request = buildDeepSeekRequest(await evalRequest());
  const response = validResponse(request);
  response.output = [
    { type: "function_call", arguments: "not-an-answer" },
    ...(response.output as unknown[]),
    { type: "unknown", content: [{ type: "output_text", text: "not-an-answer" }] },
  ];
  assert.doesNotMatch(mapDeepSeekResponse(response).output, /not-an-answer/);
});

test("response model and ID are captured rather than fabricated", async () => {
  const transport = new FakeTransport(request => validResponse(request, "deepseek-returned-2026-09"));
  const response = await client(transport).complete(await evalRequest());
  assert.equal(response.resolvedIdentity?.modelVersion, "deepseek-returned-2026-09");
  assert.notEqual(response.resolvedIdentity?.modelVersion, response.resolvedIdentity?.modelId);
  assert.deepEqual(response.providerMetadata, { responseId: "response-fake-id", finishReason: "completed" });
});

test("usage maps input_tokens and output_tokens exactly", async () => {
  const transport = new FakeTransport(request => validResponse(request));
  assert.deepEqual((await client(transport).complete(await evalRequest())).usage, { inputTokens: 123, outputTokens: 17 });
});

test("missing or partial usage remains null", async () => {
  const missing = new FakeTransport(request => validResponse(request, expectedVersion, false));
  assert.equal((await client(missing).complete(await evalRequest())).usage, null);
  const partial = new FakeTransport(request => ({ ...validResponse(request), usage: { input_tokens: 123 } }));
  assert.equal((await client(partial).complete(await evalRequest())).usage, null);
});

test("reasoning token usage fails closed", async () => {
  const transport = new FakeTransport(request => ({
    ...validResponse(request),
    usage: { input_tokens: 123, output_tokens: 17, output_tokens_details: { reasoning_tokens: 1 } },
  }));
  await assert.rejects(client(transport).complete(await evalRequest()), /DEEPSEEK_REASONING_NOT_DISABLED/);
});

test("reasoning output items fail closed and are never answer text", async () => {
  const transport = new FakeTransport(request => ({
    ...validResponse(request),
    output: [{ type: "reasoning", content: [{ type: "reasoning_text", text: "hidden" }] }],
  }));
  await assert.rejects(client(transport).complete(await evalRequest()), /DEEPSEEK_REASONING_NOT_DISABLED/);
});

test("incomplete responses fail safely", async () => {
  const transport = new FakeTransport(request => ({
    ...validResponse(request), status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
  }));
  await assert.rejects(client(transport).complete(await evalRequest()), /DEEPSEEK_INVALID_RESPONSE/);
});

test("malformed provider output becomes a safe unavailable evaluation", async () => {
  const transport = new FakeTransport(request => ({
    ...validResponse(request),
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "{not-json" }] }],
  }));
  const run = await runEvaluation(await casesPromise, client(transport), {
    expectedDatasetHash: lock.datasetHash,
    expectedConfigHash: lock.evaluationConfigHash,
    allowLive: true,
    frozenCommit: REVIEWED_PRE_LIVE_FROZEN_COMMIT,
  });
  assert.ok(run.results.flatMap(result => result.calls).every(call => call.error === "SEMANTIC_UNAVAILABLE"));
  assert.ok(run.results.every(result => result.finalRouting !== "AUTO_ACCEPT_ELIGIBLE"));
});

test("provider model drift aborts through the existing runner guard", async () => {
  const transport = new FakeTransport(request => validResponse(request, "changed-version"));
  await assert.rejects(runEvaluation(await casesPromise, client(transport), {
    expectedDatasetHash: lock.datasetHash,
    expectedConfigHash: lock.evaluationConfigHash,
    allowLive: true,
    frozenCommit: REVIEWED_PRE_LIVE_FROZEN_COMMIT,
  }), /MODEL_IDENTITY_CHANGED/);
  assert.equal(transport.requests.length, 1);
});

test("adapter transport cannot mutate the ValidationPacket", async () => {
  const request = await evalRequest();
  const before = digest(request.packet);
  const transport = new FakeTransport(parameters => {
    const parsed = JSON.parse(parameters.input);
    parsed.validationPacket.primaryEvidence.length = 0;
    return validResponse(parameters);
  });
  await client(transport).complete(request);
  assert.equal(digest(request.packet), before);
});

test("provider errors are bounded and never expose a fake API key", async () => {
  const key = "fake-deepseek-secret-for-test";
  const transport = new FakeTransport(() => { throw new Error(`upstream rejected Bearer ${key}`); });
  await assert.rejects(client(transport).complete(await evalRequest()), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "DEEPSEEK_PROVIDER_ERROR");
    assert.ok(!error.message.includes(key));
    return true;
  });
});

test("official transport targets only the DeepSeek Responses endpoint through injected fetch", async () => {
  const request = buildDeepSeekRequest(await evalRequest());
  let capturedBody: string | undefined;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(input.toString(), "https://api.deepseek.com/responses");
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer fake-transport-key");
    capturedBody = init?.body as string;
    return new Response(JSON.stringify(validResponse(request)), { status: 200 });
  }) as typeof fetch;
  const transport = createOfficialDeepSeekTransport("fake-transport-key", fakeFetch);
  assert.equal((await transport.createResponse(request)).status, "completed");
  assert.deepEqual(JSON.parse(capturedBody!), request);
});

test("official transport categorizes HTTP failure without exposing its body or fake key", async () => {
  const secret = "fake-http-error-secret";
  const fakeFetch = (async () => new Response(JSON.stringify({ message: secret }), { status: 401 })) as typeof fetch;
  const transport = createOfficialDeepSeekTransport(secret, fakeFetch);
  await assert.rejects(transport.createResponse(buildDeepSeekRequest(await evalRequest())), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "DEEPSEEK_AUTH_FAILED");
    assert.ok(!error.message.includes(secret));
    return true;
  });
});

test("official benchmark client requires the selected alias and a resolved version", () => {
  const transport = new FakeTransport(request => validResponse(request));
  assert.throws(() => createDeepSeekEvalClient({
    requestedModelId: "deepseek-v4-flash" as typeof DEEPSEEK_REQUESTED_MODEL,
    expectedResolvedModelVersion: expectedVersion,
    transport,
  }), /DEEPSEEK_MODEL_ID_UNSUPPORTED/);
  assert.throws(() => client(transport, ""), /DEEPSEEK_RESOLVED_MODEL_VERSION_REQUIRED/);
});

test("synthetic probe is independent of Benchmark stories", () => {
  const serialized = serializeDeepSeekRequestForBudget(buildDeepSeekProbeRequest());
  assert.match(serialized, /A red key is lying on the desk/);
  assert.match(serialized, /00000000-0000-4000-8000-0000000000e1/);
  for (const forbidden of ["H01", "H20", "Ch13", "Ch14", "Ch15", "Ch16", "Ch17", "goldSemanticVerdict"])
    assert.ok(!serialized.includes(forbidden), forbidden);
  assert.deepEqual(JSON.parse(buildDeepSeekProbeRequest().input).validationPacket, SYNTHETIC_PROBE_PACKET);
});

test("synthetic probe evidence span exactly covers its quote", () => {
  const evidence = SYNTHETIC_PROBE_PACKET.primaryEvidence[0];
  assert.equal(evidence.quote, SYNTHETIC_PROBE_QUOTE);
  assert.equal(evidence.end - evidence.start, evidence.quote.length);
});

test("synthetic probe response exposes version metadata and parser compatibility", () => {
  const request = buildDeepSeekProbeRequest();
  const result = parseDeepSeekProbeResponse(validResponse(request, "probe-returned-version"));
  assert.equal(result.requestedModelId, "deepseek-flash");
  assert.equal(result.resolvedModelVersion, "probe-returned-version");
  assert.equal(result.providerResponseId, "response-fake-id");
  assert.equal(result.semantic.verdict, "SUPPORTED");
});

test("probe CLI fails closed without reading a key or importing transport construction", () => {
  const script = readFileSync("scripts/eval-semantic-deepseek-probe-disabled.ts", "utf8");
  assert.ok(!script.includes("DEEPSEEK_API_KEY"));
  assert.ok(!script.includes("createOfficialDeepSeekTransport"));
  const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/eval-semantic-deepseek-probe-disabled.ts"], {
    encoding: "utf8",
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH ?? "",
      NODE_PATH: process.env.NODE_PATH ?? "",
      DEEPSEEK_API_KEY: "fake-secret-must-not-appear",
    },
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /DEEPSEEK_PROBE_NOT_AUTHORIZED/);
  assert.ok(!run.stderr.includes("fake-secret-must-not-appear"));
  assert.throws(() => assertDeepSeekProbeDisabled(), /DEEPSEEK_PROBE_NOT_AUTHORIZED/);
});

test("offline preflight serializes DeepSeek wire requests from frozen routing", async () => {
  const preflight = await buildLivePreflight();
  assert.equal(preflight.provider, "deepseek-api");
  assert.equal(preflight.requestedModelId, "deepseek-flash");
  assert.equal(preflight.resolvedModelVersion, null);
  assert.deepEqual(preflight.calls.primary, { generic: 30, specialist: 69 });
  assert.deepEqual(preflight.calls.stability, { generic: 30, specialist: 69 });
  assert.deepEqual(preflight.calls.byAgent, { generic: 60, evidence: 60, knowledge_boundary: 20, temporal_state: 58 });
  assert.equal(preflight.calls.total, 198);
  assert.equal(Object.values(preflight.calls.byAgent).reduce((sum, count) => sum + count, 0), 198);
  assert.equal(preflight.realProviderCalls, 0);
  assert.ok(preflight.requestSize.totalBytes > 0 && preflight.requestSize.maxBytes > 0);
  assert.match(preflight.roughLocalTokenBudgetEstimate.label, /NOT PROVIDER TOKEN COUNT/);
});

test("prepared manifest selects DeepSeek alias but remains unauthorized and unresolved", () => {
  const manifest = readPreparedManifest();
  assert.doesNotThrow(() => assertPreparedManifest(manifest));
  assert.equal(manifest.provider, "deepseek-api");
  assert.equal(manifest.requestedModelId, "deepseek-flash");
  assert.equal(manifest.expectedResolvedModelVersion, null);
  assert.equal(manifest.status, "PREPARED_NOT_AUTHORIZED");
  assert.equal(manifest.authorizedAt, null);
  assert.equal(manifest.authorizedBy, null);
});

test("probe and official live execution boundaries both reject execution", () => {
  assert.throws(() => assertDeepSeekProbeDisabled(), /DEEPSEEK_PROBE_NOT_AUTHORIZED/);
  assert.throws(() => assertAuthorizedManifest(readPreparedManifest()), /LIVE_RUN_NOT_AUTHORIZED/);
  assert.throws(() => assertB0ExecutionDisabled(), /LIVE_RUN_NOT_AUTHORIZED/);
});

test("DeepSeek adapter cannot reach transport without runner live authorization", async () => {
  const transport = new FakeTransport(request => validResponse(request));
  await assert.rejects(runEvaluation(await casesPromise, client(transport), {
    expectedDatasetHash: lock.datasetHash,
    expectedConfigHash: lock.evaluationConfigHash,
  }), /LIVE_RUN_NOT_AUTHORIZED/);
  assert.equal(transport.requests.length, 0);
});

test("raw result schema rejects missing provenance and accepts DeepSeek example", () => {
  const example = JSON.parse(readFileSync("tests/fixtures/live-semantic-raw-result.example.json", "utf8"));
  assert.doesNotThrow(() => rawResultRecordSchema.parse(example));
  assert.equal(example.provider, "deepseek-api");
  assert.equal(example.requestedModelId, "deepseek-flash");
  const missing = structuredClone(example);
  delete missing.datasetHash;
  assert.throws(() => rawResultRecordSchema.parse(missing));
});

test("completed official artifact bundles cannot be silently overwritten", () => {
  const directory = mkdtempSync(join(tmpdir(), "storystate-live-artifacts-"));
  const prepared = readPreparedManifest();
  const manifest = {
    ...prepared,
    status: "AUTHORIZED" as const,
    expectedResolvedModelVersion: expectedVersion,
    authorizedAt: "2026-09-15T01:00:00.000Z",
    authorizedBy: "Product Owner",
  };
  const raw = rawResultRecordSchema.parse(JSON.parse(readFileSync("tests/fixtures/live-semantic-raw-result.example.json", "utf8")));
  const provenance = {
    experimentId: manifest.experimentId,
    benchmarkVersion: manifest.benchmarkVersion,
    datasetHash: manifest.datasetHash,
    evaluationConfigHash: manifest.evaluationConfigHash,
    reviewedFrozenCommit: manifest.reviewedFrozenCommit,
    provider: manifest.provider,
    requestedModelId: manifest.requestedModelId,
    resolvedModelVersion: expectedVersion,
  };
  const rawResults = Array.from({ length: manifest.expectedCallCount }, (_, index) => ({
    ...raw, ...provenance, caseId: `SANITIZED-${index}`,
  }));
  const summary = executionSummarySchema.parse({
    ...provenance,
    status: "COMPLETED",
    startedAt: "2026-09-15T01:00:00.000Z",
    finishedAt: "2026-09-15T02:00:00.000Z",
    expectedCallCount: manifest.expectedCallCount,
    completedCallCount: manifest.expectedCallCount,
    failedCallCount: 0,
    errorCategory: null,
  });
  const bundle = {
    manifest,
    rawResults,
    summary,
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

test("Gemini runtime code and dependency are removed from the official package", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.dependencies["@google/genai"], undefined);
  assert.equal(existsSync("lib/eval/providers/gemini.ts"), false);
});

test("Stage 2.2.1A benchmark, prompts and configuration freeze remain unchanged", async () => {
  const cases = await casesPromise;
  assert.equal(datasetHash(cases), lock.datasetHash);
  assert.equal(benchmarkFingerprint(cases), lock.benchmarkFingerprint);
  assert.equal(sourceDigest(), lock.sourceDigest);
  assert.equal(evaluationConfigHash(), lock.evaluationConfigHash);
  assert.equal(lock.realProviderCalls, 0);
});

test("Frozen Docs are byte-unchanged from the B0 base", () => {
  assert.doesNotThrow(() => execFileSync("git", [
    "diff", "--quiet", "3e48910a8fac9cca65abd7e66de060058605f057", "--",
    "docs/STATE_DATA_CONTRACT_V0.2.1.md",
    "docs/BENCHMARK_PILOT_V0.2.2.md",
    "docs/VALIDATOR_RULEBOOK_V0.1.1.md",
  ]));
});
