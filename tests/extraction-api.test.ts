import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemoryStateRepository } from "../lib/repositories/memory-state-repository";
import { StateService } from "../lib/server/state-service";
import { ExtractionService } from "../lib/extraction/service";
import { FakeExtractorProvider } from "../lib/extraction/provider";
import { productionExtractor } from "../lib/extraction/production";
import { extractionRequest, toExtractionRunDto } from "../lib/server/extraction-api";
import { toReviewHydrationDto } from "../lib/server/review-hydration";
import { respond } from "../lib/server/api";
import type { ExtractionProposal } from "../lib/extraction/contract";
import type { SemanticModelClient, SemanticRequest } from "../lib/server/validator/semantic";
import { RuntimeValidator } from "../lib/server/validator/runtime-validator";
import { createStory, epistemic, seedRecords } from "./helpers/backend";

class ThrowingSemanticClient implements SemanticModelClient {
  readonly modelId = "unavailable-test-client";
  calls = 0;
  async complete(_request: SemanticRequest): Promise<unknown> {
    void _request;
    this.calls += 1;
    throw new Error("provider detail must never reach the review payload");
  }
}

class SupportedSemanticClient implements SemanticModelClient {
  readonly modelId = "supported-test-client";
  calls = 0;
  async complete(request: SemanticRequest): Promise<unknown> {
    this.calls += 1;
    return {
      agent: request.agent,
      verdict: "SUPPORTED",
      reason: "Exact source evidence supports this candidate.",
      evidenceIds: request.packet.primaryEvidence.map(value => value.id),
    };
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
  return { repository, storyId, characterId, itemId, revisionId };
}

function twoCandidateProposal(): ExtractionProposal {
  const proposal = validProposal();
  return {
    ...proposal,
    effects: [
      ...proposal.effects,
      {
        eventKey: "EV1", evidenceKeys: ["E1"], supportKinds: ["direct_observation"], supportSummary: "The recorder was damaged on arrival.", confidence: 0.85,
        kind: "item_condition", itemRef: "ITEM_001", condition: "damaged",
      },
    ],
  };
}

function validProposal(): ExtractionProposal {
  return {
    evidence: [{ key: "E1", quote: "纪川到达控制室。", occurrence: 0, speakerRef: "CHAR_001" }],
    events: [{ key: "EV1", kind: "movement", participantRefs: ["CHAR_001"], evidenceKeys: ["E1"] }],
    effects: [{
      eventKey: "EV1", evidenceKeys: ["E1"], supportKinds: ["direct_observation"], supportSummary: "Arrival is explicit.", confidence: 0.9,
      kind: "character_location", characterRef: "CHAR_001", after: { value: "Control Room", status: "resolved", lastConfirmedValue: "Control Room" },
    }],
    unresolvedMentions: [],
  };
}

test("extraction API DTO is frontend-safe and review hydration reloads persisted provenance", async () => {
  const f = await fixture();
  const extraction = new ExtractionService(f.repository, new FakeExtractorProvider(validProposal()), new ThrowingSemanticClient());
  const response = await extractionRequest(
    new Request("http://localhost/api/stories/extract", { method: "POST", body: JSON.stringify({ sourceRevisionId: f.revisionId }) }),
    f.storyId,
    extraction,
  );
  assert.equal(response.status, "completed");
  assert.equal(response.candidateDeltas.length, 1);
  assert.equal(response.validatorResults[0]?.recommendation, "NEEDS_REVIEW");
  assert.deepEqual(response.validationIssues, []);
  assert.equal(response.evidence[0].quote, "纪川到达控制室。");
  assert.equal("packet" in response, false);
  assert.equal("proposal" in response, false);
  assert.equal("error" in response, false);
  const hydrated = toReviewHydrationDto(await f.repository.read(f.storyId));
  assert.equal(hydrated.candidateDeltas.length, 1);
  assert.equal(hydrated.candidateDeltas[0].validatorResult?.recommendation, "NEEDS_REVIEW");
  assert.deepEqual(hydrated.candidateDeltas[0].evidenceIds, [hydrated.evidence[0].id]);
  assert.equal(hydrated.events[0].sourceRevisionId, f.revisionId);
  assert.equal(hydrated.sourceRevisions[0].id, f.revisionId);
});

test("validator provider failure after persistence leaves candidates reachable for review", async () => {
  const f = await fixture();
  const semantic = new ThrowingSemanticClient();
  const result = await new ExtractionService(f.repository, new FakeExtractorProvider(validProposal()), semantic).extractRevision(f.storyId, f.revisionId);
  assert.equal(result.status, "completed");
  assert.equal(semantic.calls, 1);
  assert.equal(result.deltas.length, 1);
  assert.equal(result.validatorResults[0]?.status, "needs_review");
  assert.deepEqual(result.validationIssues, []);
  const hydrated = toReviewHydrationDto(await f.repository.read(f.storyId));
  assert.equal(hydrated.candidateDeltas[0].id, result.deltas[0].id);
  assert.equal(hydrated.candidateDeltas[0].validatorResult?.checks?.some(check => check.code === "SEMANTIC_UNAVAILABLE"), true);
});

test("review hydration keeps rejected uncommitted deltas as audit data only", async () => {
  const f = await fixture();
  const result = await new ExtractionService(
    f.repository,
    new FakeExtractorProvider(validProposal()),
    new SupportedSemanticClient(),
  ).extractRevision(f.storyId, f.revisionId);
  const rejectedId = result.deltas[0].id;
  await f.repository.transaction(f.storyId, aggregate => {
    const rejected = aggregate.deltas.find(delta => delta.id === rejectedId)!;
    rejected.decision = "rejected";
    rejected.decisions.push({
      decision: "rejected",
      actor: "integration-test",
      reason: "Explicit review rejection",
      createdAt: new Date().toISOString(),
    });
  });

  const aggregate = await f.repository.read(f.storyId);
  assert.equal(aggregate.deltas.some(delta => delta.id === rejectedId), true);
  assert.equal(
    toReviewHydrationDto(aggregate).candidateDeltas.some(
      delta => delta.id === rejectedId,
    ),
    false,
  );
});

test("unexpected validator failure is isolated per candidate and exposed without orphaning persisted review", async () => {
  const f = await fixture();
  const before = (await f.repository.read(f.storyId)).state;
  const semantic = new SupportedSemanticClient();
  const runtime = new RuntimeValidator(f.repository, semantic);
  let validationCalls = 0;
  const extraction = new ExtractionService(
    f.repository,
    new FakeExtractorProvider(twoCandidateProposal()),
    semantic,
    20000,
    () => ({
      async validate(storyId, deltaId, expectedVersion) {
        validationCalls += 1;
        if (validationCalls === 2) throw new Error("unexpected validator writeback failure");
        return runtime.validate(storyId, deltaId, expectedVersion);
      },
    }),
  );
  const response = await extractionRequest(
    new Request("http://localhost/api/stories/extract", { method: "POST", body: JSON.stringify({ sourceRevisionId: f.revisionId }) }),
    f.storyId,
    extraction,
  );
  assert.equal(response.status, "completed");
  assert.equal(validationCalls, 2);
  assert.equal(response.candidateDeltas.length, 2);
  assert.equal(response.candidateDeltas[0].validatorResult?.recommendation, "AUTO_ACCEPT_ELIGIBLE");
  assert.equal(response.candidateDeltas[1].validatorResult, null);
  assert.deepEqual(response.validationIssues, [{ deltaId: response.candidateDeltas[1].id, code: "VALIDATOR_UNAVAILABLE" }]);
  for (const delta of response.candidateDeltas) {
    assert.equal(delta.decision, "needs_review");
    assert.deepEqual(delta.decisions, []);
    assert.equal(delta.committedVersionId, null);
  }
  const after = await f.repository.read(f.storyId);
  assert.deepEqual(after.state, before);
  const hydrated = toReviewHydrationDto(after);
  assert.deepEqual(hydrated.candidateDeltas.map(delta => delta.id), response.candidateDeltas.map(delta => delta.id));
  assert.equal(hydrated.candidateDeltas[0].validatorResult?.recommendation, "AUTO_ACCEPT_ELIGIBLE");
  assert.equal(hydrated.candidateDeltas[1].validatorResult, null);
});

test("a first-candidate validator failure does not stop later validation", async () => {
  const f = await fixture();
  const semantic = new SupportedSemanticClient();
  const runtime = new RuntimeValidator(f.repository, semantic);
  let validationCalls = 0;
  const extraction = new ExtractionService(
    f.repository,
    new FakeExtractorProvider(twoCandidateProposal()),
    semantic,
    20000,
    () => ({
      async validate(storyId, deltaId, expectedVersion) {
        validationCalls += 1;
        if (validationCalls === 1) throw new Error("validator unavailable");
        return runtime.validate(storyId, deltaId, expectedVersion);
      },
    }),
  );
  const result = await extraction.extractRevision(f.storyId, f.revisionId);
  assert.equal(result.status, "completed");
  assert.equal(validationCalls, 2);
  assert.equal(result.deltas.length, 2);
  assert.deepEqual(result.validationIssues, [{ deltaId: result.deltas[0].id, code: "VALIDATOR_UNAVAILABLE" }]);
  assert.equal(result.validatorResults[0], null);
  assert.ok(result.validatorResults[1]);
  assert.ok(result.deltas.every(delta => delta.decision === "needs_review" && delta.decisions.length === 0 && delta.committedVersionId === null));
});

test("invalid extractor output maps to sanitized 422 and bad source ID maps to 400", async () => {
  const f = await fixture();
  const invalid = new ExtractionService(f.repository, new FakeExtractorProvider("{bad-json"), new ThrowingSemanticClient());
  const invalidResponse = await respond(() => extractionRequest(
    new Request("http://localhost/api/stories/extract", { method: "POST", body: JSON.stringify({ sourceRevisionId: f.revisionId }) }),
    f.storyId,
    invalid,
  ));
  assert.equal(invalidResponse.status, 422);
  assert.deepEqual(await invalidResponse.json(), { error: "EXTRACTION_OUTPUT_INVALID", message: "Extractor returned an invalid structured proposal" });
  const schemaInvalid = new ExtractionService(
    f.repository,
    new FakeExtractorProvider(JSON.stringify({ evidence: [], events: [], effects: [] })),
    new ThrowingSemanticClient(),
  );
  const schemaInvalidResponse = await respond(() => extractionRequest(
    new Request("http://localhost/api/stories/extract", { method: "POST", body: JSON.stringify({ sourceRevisionId: f.revisionId }) }),
    f.storyId,
    schemaInvalid,
  ));
  assert.equal(schemaInvalidResponse.status, 422);
  assert.deepEqual(await schemaInvalidResponse.json(), { error: "EXTRACTION_OUTPUT_INVALID", message: "Extractor returned an invalid structured proposal" });
  const badIdResponse = await respond(() => extractionRequest(
    new Request("http://localhost/api/stories/extract", { method: "POST", body: JSON.stringify({ sourceRevisionId: "not-a-uuid" }) }),
    f.storyId,
    invalid,
  ));
  assert.equal(badIdResponse.status, 400);
});

test("extractor outage and missing production configuration map to sanitized availability errors", async () => {
  const f = await fixture();
  const unavailable = new ExtractionService(f.repository, {
    modelId: "unavailable-provider",
    async complete() { throw new Error("do not disclose remote provider detail"); },
  }, new ThrowingSemanticClient());
  const unavailableResponse = await respond(() => extractionRequest(
    new Request("http://localhost/api/stories/extract", { method: "POST", body: JSON.stringify({ sourceRevisionId: f.revisionId }) }),
    f.storyId,
    unavailable,
  ));
  assert.equal(unavailableResponse.status, 502);
  assert.deepEqual(await unavailableResponse.json(), { error: "EXTRACTOR_UNAVAILABLE", message: "Extraction service is unavailable" });
  const saved = process.env.STORYSTATE_EXTRACTOR_MODEL;
  delete process.env.STORYSTATE_EXTRACTOR_MODEL;
  try {
    const missingConfigResponse = await respond(async () => productionExtractor());
    assert.equal(missingConfigResponse.status, 503);
    assert.deepEqual(await missingConfigResponse.json(), { error: "EXTRACTOR_NOT_CONFIGURED", message: "Extraction service is not configured" });
  } finally {
    if (saved === undefined) delete process.env.STORYSTATE_EXTRACTOR_MODEL; else process.env.STORYSTATE_EXTRACTOR_MODEL = saved;
  }
});

test("production extractor fails closed without server-only configuration", () => {
  const saved = {
    model: process.env.STORYSTATE_EXTRACTOR_MODEL,
    endpoint: process.env.STORYSTATE_EXTRACTOR_ENDPOINT,
    apiKey: process.env.STORYSTATE_EXTRACTOR_API_KEY,
  };
  delete process.env.STORYSTATE_EXTRACTOR_MODEL;
  delete process.env.STORYSTATE_EXTRACTOR_ENDPOINT;
  delete process.env.STORYSTATE_EXTRACTOR_API_KEY;
  try {
    assert.throws(() => productionExtractor(), { name: "Error", message: "Extraction service is not configured" });
  } finally {
    if (saved.model === undefined) delete process.env.STORYSTATE_EXTRACTOR_MODEL; else process.env.STORYSTATE_EXTRACTOR_MODEL = saved.model;
    if (saved.endpoint === undefined) delete process.env.STORYSTATE_EXTRACTOR_ENDPOINT; else process.env.STORYSTATE_EXTRACTOR_ENDPOINT = saved.endpoint;
    if (saved.apiKey === undefined) delete process.env.STORYSTATE_EXTRACTOR_API_KEY; else process.env.STORYSTATE_EXTRACTOR_API_KEY = saved.apiKey;
  }
});

test("DTO projection never carries failed-run internals", () => {
  const dto = toExtractionRunDto({
    status: "failed", sourceRevisionId: randomUUID(), baseStateVersion: 0, packet: null, proposal: null,
    evidence: [], events: [], deltas: [], rejectedEffects: [], compilerIssues: [], warnings: [], validatorResults: [], validationIssues: [],
    provider: { modelId: "model", calls: 1, packetHash: "hash" },
    timing: { startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", durationMs: 1000 },
    error: "EXTRACTOR_UNAVAILABLE",
  });
  assert.equal("error" in dto, false);
  assert.deepEqual(Object.keys(dto).sort(), ["baseStateVersion", "candidateDeltas", "compilerIssues", "events", "evidence", "provider", "sourceRevisionId", "status", "timing", "validationIssues", "validatorResults", "warnings"]);
});
