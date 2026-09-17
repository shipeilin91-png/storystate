import { writeFile } from "node:fs/promises";
import { MemoryStateRepository } from "../lib/repositories/memory-state-repository";
import { ExtractionService, type ExtractionRunResult } from "../lib/extraction/service";
import { productionExtractor } from "../lib/extraction/production";
import { EvidenceRetriever, type HistoricalContextProvider } from "../lib/rag/retrieval";
import { type ChunkRepository } from "../lib/rag/retrieval";
import type { EvidenceChunk } from "../lib/rag/chunks";
import { evidenceRagCases, ragAggregate, type RagCase, type ExpectedRagEffect } from "../tests/fixtures/rag-badcases";

const selected = evidenceRagCases.filter((value, index) => index % 2 === 0);
const outputFile = process.env.RAG_BENCHMARK_OUTPUT ?? "/tmp/storystate-rag-benchmark.json";
type ArmResult = Awaited<ReturnType<typeof arm>>;

class MemoryChunkRepository implements ChunkRepository {
  private chunks: EvidenceChunk[] = [];
  async index(chunks: EvidenceChunk[]) {
    for (const chunk of chunks) if (!this.chunks.some(value => value.id === chunk.id)) this.chunks.push(structuredClone(chunk));
    return { created: chunks.length, skipped: 0 };
  }
  async candidates(scope: Parameters<ChunkRepository["candidates"]>[0]) {
    return this.chunks.filter(chunk => chunk.storyId === scope.storyId);
  }
}

class NoopSemanticClient {
  readonly modelId = "rag-benchmark-noop-validator";
  async complete() {
    return { agent: "generic", verdict: "SUPPORTED", reason: "Benchmark validator stub.", evidenceIds: [] };
  }
}

function partialAfterMatches(actual: unknown, expected: unknown): boolean {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) return JSON.stringify(actual) === JSON.stringify(expected);
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(expected).every(([key, value]) => JSON.stringify((actual as Record<string, unknown>)[key]) === JSON.stringify(value));
}

function expectedMatch(result: ExtractionRunResult, expected: ExpectedRagEffect[]): boolean {
  return expected.every(target => result.deltas.some(delta =>
    delta.targetType === target.targetType && delta.targetId === target.targetId &&
    delta.fieldPath === target.fieldPath && partialAfterMatches(delta.after, target.after)));
}

async function arm(caseValue: RagCase, enabled: boolean): Promise<{
  status: ExtractionRunResult["status"]; candidateCount: number; pass: boolean;
  evidenceValid: boolean; historicalLeakage: boolean; compilerIssues: string[];
  retrievalCount: number; providerCalls: number; baseStateVersion: number;
}> {
  const { aggregate, revisionId } = ragAggregate(caseValue);
  const repository = new MemoryStateRepository();
  await repository.create(aggregate);
  const packetRepository = new MemoryChunkRepository();
  const context: HistoricalContextProvider | undefined = enabled ? new EvidenceRetriever(packetRepository) : undefined;
  const provider = productionExtractor();
  const result = await new ExtractionService(repository, provider, new NoopSemanticClient() as never, 30000, undefined, context).extractRevision(aggregate.story.id, revisionId);
  const revision = aggregate.revisions.find(value => value.id === revisionId)!;
  const evidenceValid = result.evidence.every(value => revision.content.slice(value.start, value.end) === value.quote);
  const historyText = caseValue.history.join("\n");
  const historicalLeakage = result.evidence.some(value => historyText.includes(value.quote));
  return {
    status: result.status, candidateCount: result.deltas.length,
    pass: result.status === "completed" && expectedMatch(result, caseValue.expected),
    evidenceValid, historicalLeakage, compilerIssues: result.compilerIssues.map(value => value.code),
    retrievalCount: result.packet?.historicalContext?.chunks.length ?? 0,
    providerCalls: result.provider.calls, baseStateVersion: result.baseStateVersion,
  };
}

async function main() {
  if (process.env.RAG_LIVE_BENCHMARK !== "1") {
    await writeFile(outputFile, JSON.stringify({
      status: "NOT_RUN", reason: "Set RAG_LIVE_BENCHMARK=1 to authorize the small real-model A/B.", cases: selected.map(c => c.id),
    }, null, 2));
    return;
  }
  const cases: Array<{ id: string; group: RagCase["group"]; baseline: ArmResult; rag: ArmResult }> = [];
  for (const caseValue of selected) {
    const baseline = await arm(caseValue, false);
    const rag = await arm(caseValue, true);
    cases.push({ id: caseValue.id, group: caseValue.group, baseline, rag });
  }
  const summarize = (armName: "baseline" | "rag") => {
    const values = cases.map(value => value[armName]);
    return {
      passes: values.filter(value => value.pass).length,
      evidenceValid: values.every(value => value.evidenceValid),
      historicalLeakage: values.filter(value => value.historicalLeakage).length,
      candidateCounts: values.map(value => value.candidateCount),
      retrievalCounts: values.map(value => value.retrievalCount),
      providerCalls: values.reduce((sum, value) => sum + value.providerCalls, 0),
    };
  };
  await writeFile(outputFile, JSON.stringify({
    status: "COMPLETED", datasetVersion: "evidence-rag-v0.1", cases, summary: { baseline: summarize("baseline"), rag: summarize("rag") },
  }, null, 2));
}

void main();
