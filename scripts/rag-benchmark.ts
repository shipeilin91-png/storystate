import { mkdir, writeFile } from "node:fs/promises";
import { productionExtractor } from "../lib/extraction/production";
import {
  localExtractorConfigAvailable,
  RAG_BENCHMARK_CASE_IDS,
  runRagBenchmarkCase,
  type RagBenchmarkCaseResult,
} from "../lib/rag/benchmark";

const resultDirectory = process.env.RAG_BENCHMARK_DIR ?? "docs/evaluation/rag-v0.1";
const resultsFile = `${resultDirectory}/local-results.json`;
const summaryFile = `${resultDirectory}/local-summary.json`;

function percent(value: number, total: number) {
  return Number((value * 100 / total).toFixed(2));
}

function count(values: RagBenchmarkCaseResult[], predicate: (value: RagBenchmarkCaseResult) => boolean) {
  return values.filter(predicate).length;
}

function summarizeSafety(values: RagBenchmarkCaseResult[]) {
  const fields = [
    "retrievalHitCorrectness",
    "sameStory",
    "currentRevisionExcluded",
    "futureRevisionExcluded",
    "topKPass",
    "contextBudgetPass",
    "recencyBoostPass",
    "entityBoostPass",
    "pronounEntityResolution",
  ] as const;
  return Object.fromEntries(fields.map(field => {
    const applicable = values.filter(value => value[field] !== null);
    const passed = applicable.filter(value => value[field] === true).length;
    return [field, {
      passed,
      total: applicable.length,
      percent: applicable.length ? percent(passed, applicable.length) : null,
    }];
  }));
}

async function main() {
  const realModelAB = localExtractorConfigAvailable();
  const mode = realModelAB ? "real-model" : "deterministic-safety";
  const extractor = realModelAB ? productionExtractor() : undefined;
  const cases: RagBenchmarkCaseResult[] = [];

  for (const caseId of RAG_BENCHMARK_CASE_IDS) {
    for (const arm of ["baseline", "rag"] as const) {
      cases.push(await runRagBenchmarkCase(caseId, arm, extractor));
    }
  }

  const baseline = cases.filter(value => value.arm === "baseline");
  const rag = cases.filter(value => value.arm === "rag");
  const baselinePassCount = count(baseline, value => value.pass);
  const ragPassCount = count(rag, value => value.pass);
  const baselineEffectCount = count(baseline, value => value.stateEffectCorrect);
  const ragEffectCount = count(rag, value => value.stateEffectCorrect);
  const safetyRegressionFields = [
    "staleHistoryError",
    "ownershipCustodyViolation",
    "beliefTruthViolation",
    "redundantCandidateError",
    "historicalEvidenceLeakage",
  ] as const;
  const safetyRegressions = Object.fromEntries(safetyRegressionFields.map(field => [
    field,
    {
      baseline: baseline.reduce((sum, value) => sum + value[field], 0),
      rag: rag.reduce((sum, value) => sum + value[field], 0),
    },
  ]));
  const summary = {
    status: "COMPLETED",
    datasetVersion: "evidence-rag-v0.1",
    caseCount: RAG_BENCHMARK_CASE_IDS.length,
    mode,
    realModelAB: realModelAB ? "COMPLETED" : "NOT_RUN",
    semanticPassRate: {
      baseline: realModelAB ? {
        count: baselinePassCount,
        total: baseline.length,
        percent: percent(baselinePassCount, baseline.length),
      } : null,
      rag: realModelAB ? {
        count: ragPassCount,
        total: rag.length,
        percent: percent(ragPassCount, rag.length),
      } : null,
      absoluteChangePp: realModelAB
        ? Number((percent(ragPassCount, rag.length) - percent(baselinePassCount, baseline.length)).toFixed(2))
        : null,
    },
    deterministicEffectMatch: {
      baseline: { count: baselineEffectCount, total: baseline.length, percent: percent(baselineEffectCount, baseline.length) },
      rag: { count: ragEffectCount, total: rag.length, percent: percent(ragEffectCount, rag.length) },
      note: "When realModelAB is NOT_RUN, these are conservative deterministic no-op fixture matches, not model accuracy.",
    },
    deterministicSafetyPassRate: {
      baseline: { count: count(baseline, value => value.safetyPass), total: baseline.length, percent: percent(count(baseline, value => value.safetyPass), baseline.length) },
      rag: { count: count(rag, value => value.safetyPass), total: rag.length, percent: percent(count(rag, value => value.safetyPass), rag.length) },
    },
    retrieval: summarizeSafety(rag),
    safetyRegressions,
    canonicalMutationSafety: cases.every(value => value.canonicalMutationSafe),
    extractorInputShape: cases.every(value => value.extractorInputShapeValid),
    evidenceValidity: cases.every(value => value.evidenceValid),
  };

  await mkdir(resultDirectory, { recursive: true });
  await writeFile(resultsFile, `${JSON.stringify({
    status: "COMPLETED",
    datasetVersion: "evidence-rag-v0.1",
    mode,
    realModelAB: summary.realModelAB,
    cases,
  }, null, 2)}\n`);
  await writeFile(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(JSON.stringify({
    mode,
    realModelAB: summary.realModelAB,
    retrievalHitCorrectness: summary.retrieval.retrievalHitCorrectness,
    baselinePercent: summary.semanticPassRate.baseline?.percent ?? null,
    ragPercent: summary.semanticPassRate.rag?.percent ?? null,
    absoluteChangePp: summary.semanticPassRate.absoluteChangePp,
    safetyRegressions,
  }));
}

void main();
