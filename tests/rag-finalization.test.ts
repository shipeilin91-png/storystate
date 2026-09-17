import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/internal/rag-finalize/route";
import { buildExtractionPacket } from "../lib/extraction/packet";
import { FakeExtractorProvider } from "../lib/extraction/provider";
import {
  RAG_FINALIZATION_CASE_IDS,
  RAG_MIGRATION_SQL,
  runRagBenchmarkCase,
} from "../lib/rag/finalization";
import { evidenceRagCases, ragAggregate } from "./fixtures/rag-badcases";

test("temporary finalization route rejects missing auth and arbitrary actions", async () => {
  const unauthorized = await POST(new Request("https://example.test/api/internal/rag-finalize", {
    method: "POST",
    body: JSON.stringify({ action: "status" }),
  }));
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { error: "UNAUTHORIZED" });

  const prior = process.env.STORYSTATE_RAG_FINALIZE_TOKEN;
  process.env.STORYSTATE_RAG_FINALIZE_TOKEN = "a".repeat(64);
  try {
    const invalid = await POST(new Request("https://example.test/api/internal/rag-finalize", {
      method: "POST",
      headers: { Authorization: `Bearer ${"a".repeat(64)}` },
      body: JSON.stringify({ action: "shell", command: "env" }),
    }));
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "INVALID_INPUT" });
  } finally {
    if (prior === undefined) delete process.env.STORYSTATE_RAG_FINALIZE_TOKEN;
    else process.env.STORYSTATE_RAG_FINALIZE_TOKEN = prior;
  }
});

test("status returns only sanitized readiness data", async () => {
  const prior = { ...process.env };
  const token = "b".repeat(64);
  Object.assign(process.env, {
    STORYSTATE_RAG_FINALIZE_TOKEN: token,
    STORYSTATE_DATABASE_URL: "postgresql://db.example.test/story",
    STORYSTATE_EXTRACTOR_API_KEY: "extractor-secret",
    STORYSTATE_EXTRACTOR_ENDPOINT: "https://api.deepseek.com/chat/completions",
    STORYSTATE_EXTRACTOR_MODEL: "deepseek-flash",
    STORYSTATE_RAG_ENABLED: "0",
  });
  try {
    const response = await POST(new Request("https://example.test/api/internal/rag-finalize", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "status" }),
    }));
    assert.equal(response.status, 200);
    const output = await response.json();
    assert.deepEqual(output, {
      status: "READY",
      databaseTarget: "REMOTE",
      ragEnabled: false,
      caseCount: 12,
    });
    const serialized = JSON.stringify(output);
    for (const secret of [token, "extractor-secret"]) {
      assert.equal(serialized.includes(secret), false);
    }
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in prior)) delete process.env[key];
    }
    Object.assign(process.env, prior);
  }
});

test("migration is fixed, additive and destructive-operation free", () => {
  assert.match(RAG_MIGRATION_SQL, /create extension if not exists vector/i);
  assert.match(RAG_MIGRATION_SQL, /create table if not exists story_evidence_chunks/i);
  assert.match(RAG_MIGRATION_SQL, /create index if not exists/i);
  assert.doesNotMatch(RAG_MIGRATION_SQL, /\b(drop|truncate|reset)\b/i);
});

test("one benchmark action returns the exact sanitized result contract", async () => {
  const caseValue = evidenceRagCases.find(value => value.id === "R03")!;
  const fixture = ragAggregate(caseValue);
  const packet = buildExtractionPacket(fixture.aggregate, fixture.revisionId);
  const alias = (id: string) => packet.entities.find(entity => entity.id === id)!.alias;
  const expected = caseValue.expected[0]!;
  const itemAlias = alias(expected.targetId);
  const holderId = (expected.after as { value: string }).value;
  const output = {
    evidence: [{
      key: "E1",
      quote: "纪川把黑匣记录器递给程雾",
      occurrence: 0,
      speakerRef: null,
    }],
    events: [{
      key: "EV1",
      kind: "transfer",
      participantRefs: packet.entities
        .filter(entity => entity.kind === "character" &&
          ["纪川", "程雾"].some(name => entity.labels.includes(name)))
        .map(entity => entity.alias),
      evidenceKeys: ["E1"],
    }],
    effects: [{
      eventKey: "EV1",
      evidenceKeys: ["E1"],
      supportKinds: ["direct_observation"],
      supportSummary: "The current handoff changes possession only.",
      confidence: 1,
      kind: "item_holder",
      itemRef: itemAlias,
      after: {
        valueRef: alias(holderId),
        status: "resolved",
        lastConfirmedValueRef: alias(holderId),
      },
    }],
    unresolvedMentions: [],
  };
  const result = await runRagBenchmarkCase(
    "R03",
    "baseline",
    new FakeExtractorProvider(output),
  );
  assert.equal(result.pass, true);
  assert.deepEqual(Object.keys(result).sort(), [
    "arm",
    "beliefTruthViolation",
    "caseId",
    "entityResolutionCorrect",
    "evidenceValid",
    "group",
    "historicalEvidenceLeakage",
    "ownershipCustodyViolation",
    "pass",
    "redundantCandidateError",
    "schemaValid",
    "staleHistoryError",
    "stateEffectCorrect",
  ].sort());
  assert.deepEqual(RAG_FINALIZATION_CASE_IDS, [
    "R01", "R02", "R03", "R04", "R05", "R06",
    "R07", "R08", "R09", "R10", "R11", "R12",
  ]);

  const ownershipOutput = structuredClone(output);
  ownershipOutput.effects[0]!.kind = "item_owner";
  const ownership = await runRagBenchmarkCase(
    "R03",
    "baseline",
    new FakeExtractorProvider(ownershipOutput),
  );
  assert.equal(ownership.pass, false);
  assert.ok(ownership.ownershipCustodyViolation > 0);
});
