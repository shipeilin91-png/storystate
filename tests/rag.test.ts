import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildExtractionPacket } from "../lib/extraction/packet";
import { buildExtractionRequest } from "../lib/extraction/prompt";
import { ExtractionService } from "../lib/extraction/service";
import { FakeExtractorProvider } from "../lib/extraction/provider";
import { MemoryStateRepository } from "../lib/repositories/memory-state-repository";
import { StateService } from "../lib/server/state-service";
import { chunkText, chunksForRevision, contentHash, type EvidenceChunk } from "../lib/rag/chunks";
import { eligibleHistory, ragEnabled, scopeFor, selectHistoricalContext, type ChunkRepository, type HistoricalContextProvider, type RetrievalScope } from "../lib/rag/retrieval";
import { VECTOR_DIMENSIONS, vectorize } from "../lib/rag/vectorizer";
import { extractionDevelopmentIds as ids } from "./fixtures/extraction-development";
import { ragAggregate, evidenceRagCases } from "./fixtures/rag-badcases";
import { createStory, seedRecords, epistemic } from "./helpers/backend";

class MemoryChunkRepository implements ChunkRepository {
  chunks: EvidenceChunk[] = [];
  async index(chunks: EvidenceChunk[]) {
    const before = this.chunks.length;
    for (const chunk of chunks) if (!this.chunks.some(value => value.id === chunk.id)) this.chunks.push(structuredClone(chunk));
    return { created: this.chunks.length - before, skipped: chunks.length - (this.chunks.length - before) };
  }
  async candidates(scope: RetrievalScope) {
    return this.chunks.filter(chunk => chunk.storyId === scope.storyId);
  }
}

const dimension = (value: unknown) => Array.isArray(value) && value.length === VECTOR_DIMENSIONS;
const norm = (value: number[]) => Math.hypot(...value);

test("vectorizer is deterministic, multilingual and L2-normalized", () => {
  for (const text of ["", "中文角色在维修间。", "English holder transfer.", "中英 mixed evidence"]) {
    const first = vectorize(text);
    assert.equal(dimension(first), true);
    assert.deepEqual(first, vectorize(text));
    if (text) assert.ok(Math.abs(norm(first) - 1) < 1e-9);
  }
  assert.deepEqual(vectorize(""), Array(VECTOR_DIMENSIONS).fill(0));
});

test("chunking preserves exact content, hashes and deterministic long splits", () => {
  const empty = chunkText(" \n\n ");
  assert.deepEqual(empty, []);
  const source = ["第一段：纪川在维修间。", "Second paragraph: the recorder remains with Ji.", "第三段：林夏阅读了报告。"].join("\n\n");
  const chunks = chunkText(source);
  assert.equal(chunks.map(chunk => chunk.content).join(""), source);
  assert.deepEqual(chunks, chunkText(source));
  assert.ok(chunks.every(chunk => source.slice(chunk.start, chunk.end) === chunk.content));
  assert.ok(chunks.every(chunk => chunk.contentHash === contentHash(chunk.content)));
  const long = "纪川在维修间。".repeat(180);
  assert.ok(chunkText(long).length > 1);
  assert.ok(chunkText(long).every(chunk => chunk.content.length <= 800));
});

test("historical eligibility excludes current, future, hidden and superseded revisions", () => {
  const fixture = ragAggregate(evidenceRagCases[0]);
  const packet = buildExtractionPacket(fixture.aggregate, fixture.revisionId);
  const current = fixture.aggregate.revisions.at(-1)!;
  const currentDocument = fixture.aggregate.documents.at(-1)!;
  fixture.aggregate.revisions.push({
    id: "00000000-0000-4000-8000-000000000099", documentId: currentDocument.id,
    revisionNumber: 2, content: "superseding current document", visibility: "canonical",
  });
  fixture.aggregate.revisions.push({
    id: "00000000-0000-4000-8000-000000000098", documentId: "00000000-0000-4000-8000-000000000097",
    revisionNumber: 1, content: "future", visibility: "canonical",
  });
  fixture.aggregate.documents.push({
    id: "00000000-0000-4000-8000-000000000097", title: "future", sourceOrder: 999, chapter: 999,
  });
  const eligible = eligibleHistory(fixture.aggregate, packet);
  assert.equal(eligible.some(value => value.id === current.id), false);
  assert.equal(eligible.some(value => value.id === "00000000-0000-4000-8000-000000000099"), false);
  assert.equal(eligible.some(value => value.id === "00000000-0000-4000-8000-000000000098"), false);
  assert.ok(eligible.every(value => value.visibility === "canonical"));
});

test("selection enforces same-story, chronology, dedupe, Top-K and context budget", () => {
  const fixture = ragAggregate(evidenceRagCases[0]);
  const packet = buildExtractionPacket(fixture.aggregate, fixture.revisionId);
  const scope = scopeFor(fixture.aggregate, packet);
  const chunk = (id: string, storyId: string, sourceRevisionId: string, sourceOrder: number, text: string): EvidenceChunk => ({
    id, storyId, sourceDocumentId: "00000000-0000-4000-8000-000000000020", sourceRevisionId,
    sourceOrder, chapter: sourceOrder, chunkIndex: 0, start: 0, end: text.length, content: text,
    contentHash: contentHash(text), vector: vectorize(text), vectorizerVersion: "signed-ngram-384/v0.1",
  });
  const historyIds = scope.eligibleRevisionIds;
  const candidates = [
    ...Array.from({ length: 8 }, (_, i) => chunk(`00000000-0000-4000-8000-0000000000${20 + i}`, fixture.aggregate.story.id, historyIds[0]!, i + 1, `纪川 ${i} 在维修间，记录器状态历史上下文。`)),
    chunk("00000000-0000-4000-8000-000000000099", "other-story", historyIds[0]!, 1, "cross story"),
    chunk("00000000-0000-4000-8000-000000000100", fixture.aggregate.story.id, packet.sourceRevisionId, 1, "current leaked"),
    chunk("00000000-0000-4000-8000-000000000101", fixture.aggregate.story.id, historyIds[0]!, 999, "future leaked"),
  ];
  const result = selectHistoricalContext(candidates, scope);
  assert.ok(result.chunks.length <= 5);
  assert.ok(result.chunks.reduce((sum, value) => sum + Array.from(value.content).length, 0) <= 3600);
  assert.ok(result.chunks.every(value => value.sourceRevisionId !== packet.sourceRevisionId && value.sourceOrder < packet.sourceOrder && value.sourceRevisionId !== "other-story"));
  assert.equal(new Set(result.chunks.map(value => value.contentHash)).size, result.chunks.length);
});

test("feature flag is off by default and only enables explicit true values", () => {
  assert.equal(ragEnabled(undefined), false);
  assert.equal(ragEnabled("0"), false);
  assert.equal(ragEnabled("false"), false);
  assert.equal(ragEnabled("1"), true);
  assert.equal(ragEnabled("true"), true);
});

test("flag-off extractor request keeps the baseline projection; flag-on request labels context-only sections", async () => {
  const fixture = ragAggregate(evidenceRagCases[2]);
  const packet = buildExtractionPacket(fixture.aggregate, fixture.revisionId);
  const off = buildExtractionRequest(packet);
  assert.equal(off.input.includes("RETRIEVED_HISTORICAL_CONTEXT"), false);
  packet.historicalContext = {
    label: "HISTORICAL_CONTEXT_ONLY",
    chunks: [{
      id: "history", sourceRevisionId: fixture.aggregate.revisions[0]!.id,
      sourceDocumentId: fixture.aggregate.documents[0]!.id, sourceOrder: 1, chapter: 1,
      content: "历史内容", contentHash: contentHash("历史内容"),
      score: 1, vectorScore: 1, recencyBoost: 0, entityBoost: 0,
    }],
  };
  const on = buildExtractionRequest(packet);
  assert.match(on.input, /CURRENT_SOURCE/);
  assert.match(on.input, /CURRENT_CANONICAL_STATE/);
  assert.match(on.input, /RETRIEVED_HISTORICAL_CONTEXT/);
  assert.match(on.system, /CURRENT SOURCE.*only authoritative source/);
});

test("RAG migration is additive and has no destructive table operations", async () => {
  const sql = await readFile("supabase/migrations/20260917000100_story_evidence_chunks.sql", "utf8");
  assert.match(sql, /create table if not exists story_evidence_chunks/i);
  assert.match(sql, /vector\(384\)/i);
  assert.doesNotMatch(sql, /\bdrop\s+(table|column|schema)\b/i);
  assert.match(sql, /unique \(story_id,source_revision_id,chunk_index,vectorizer_version\)/i);
});

test("RAG context is additive and historical text cannot become current Evidence", async () => {
  const repository = new MemoryStateRepository();
  const service = new StateService(repository);
  const storyId = await createStory(service);
  const characterId = ids.CHAR_JI;
  await seedRecords(service, storyId, [
    ["characters", { id: characterId, active: true, name: "纪川", role: "engineer", location: epistemic("Maintenance Room") }],
  ]);
  const documentId = "00000000-0000-4000-8000-000000000201";
  const historicalRevisionId = "00000000-0000-4000-8000-000000000202";
  const currentRevisionId = "00000000-0000-4000-8000-000000000203";
  await service.addSourceDocument(storyId, { id: documentId, title: "Ch1", sourceOrder: 1, chapter: 1 });
  await service.addSourceRevision(storyId, { id: historicalRevisionId, documentId, revisionNumber: 1, content: "历史内容：纪川在控制室。", visibility: "canonical" });
  await service.addSourceRevision(storyId, { id: currentRevisionId, documentId, revisionNumber: 2, content: "当前内容：他仍站在维修间。", visibility: "canonical" });
  let seenHistorical = false;
  const contextProvider: HistoricalContextProvider = {
    async retrieve() {
      seenHistorical = true;
      return { label: "HISTORICAL_CONTEXT_ONLY", chunks: [{
        id: "history", sourceRevisionId: historicalRevisionId, sourceDocumentId: documentId,
        sourceOrder: 1, chapter: 1, content: "历史内容：纪川在控制室。", contentHash: contentHash("历史内容：纪川在控制室。"),
        score: 1, vectorScore: 1, recencyBoost: 0, entityBoost: 0,
      }] };
    },
  };
  const provider = new FakeExtractorProvider({
    evidence: [{ key: "H", quote: "历史内容：纪川在控制室。", occurrence: 0, speakerRef: "CHAR_001" }],
    events: [{ key: "EV", kind: "movement", participantRefs: ["CHAR_001"], evidenceKeys: ["H"] }],
    effects: [{ eventKey: "EV", evidenceKeys: ["H"], supportKinds: ["direct_observation"], supportSummary: "bad historical quote", confidence: 1, kind: "character_location", characterRef: "CHAR_001", after: { value: "Control Room", status: "resolved", lastConfirmedValue: "Control Room" } }],
    unresolvedMentions: [],
  });
  const result = await new ExtractionService(repository, provider, undefined, 20000, undefined, contextProvider).extractRevision(storyId, currentRevisionId);
  assert.equal(seenHistorical, true);
  assert.equal(result.status, "completed");
  assert.equal(result.deltas.length, 0);
  assert.equal(result.evidence.length, 0);
  assert.ok(result.compilerIssues.some(issue => issue.code === "EVIDENCE_NOT_FOUND" || issue.code === "EVENT_GROUP_INVALID"));
  assert.equal((await repository.read(storyId)).deltas.length, 1);
});

test("retrieval repository indexes a revision idempotently", async () => {
  const fixture = ragAggregate(evidenceRagCases[2]);
  const document = fixture.aggregate.documents[0]!;
  const revision = fixture.aggregate.revisions[0]!;
  const chunks = chunksForRevision(fixture.aggregate.story.id, document, revision);
  const repository = new MemoryChunkRepository();
  assert.equal((await repository.index(chunks)).created, chunks.length);
  assert.equal((await repository.index(chunks)).created, 0);
  assert.equal(repository.chunks.length, chunks.length);
});
