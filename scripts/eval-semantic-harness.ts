import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBenchmark, benchmarkFingerprint, sourceDigest } from "../tests/fixtures/live-semantic-benchmark";
import { runEvaluation, type EvalModelClient } from "../lib/eval/runner";
import { calculateMetrics, renderReport } from "../lib/eval/metrics";

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.every(arg => ["--stability", "--report"].includes(arg)), "Only mock --stability / --report flags are allowed. No live execution.");
  const lock = JSON.parse(readFileSync("tests/fixtures/live-semantic-benchmark.lock.json", "utf8"));
  const cases = await buildBenchmark();
  assert.equal(benchmarkFingerprint(cases), lock.benchmarkFingerprint);
  assert.equal(sourceDigest(), lock.sourceDigest);
  const mock: EvalModelClient = {
    kind: "mock", identity: { provider: "deterministic-fixture", modelId: "uniform-supported", modelVersion: "v1" },
    async complete(request) {
      return { output: { agent: request.agent, verdict: "SUPPORTED", reason: "HARNESS TEST ONLY: uniform synthetic response.", evidenceIds: request.packet.primaryEvidence.map(e => e.id) } };
    },
  };
  const run = await runEvaluation(cases, mock, { expectedDatasetHash: lock.datasetHash, expectedConfigHash: lock.evaluationConfigHash, stability: args.includes("--stability") });
  const metrics = calculateMetrics(cases, run);
  if (args.includes("--report")) console.log(renderReport(metrics));
  else console.log(JSON.stringify({
    label: run.label, cases: cases.length, realProviderCalls: 0, fixtureLocked: true,
    primaryHoldout: Object.fromEntries(["generic", "specialist"].map(key => {
      const m = metrics.holdout[key as "generic" | "specialist"];
      return [key, { semanticAccuracy: m.semanticAccuracy, falseAutoAccept: m.falseAutoAccept, safeAutoCoverage: m.safeAutoCoverage, averageModelCalls: m.averageModelCalls }];
    })),
    stability: { generic: metrics.stability.generic.exactAgreement, specialist: metrics.stability.specialist.exactAgreement },
    cost: metrics.allRunsConsumption.costStatus,
    interpretation: metrics.architectureEvidence.interpretation,
  }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
