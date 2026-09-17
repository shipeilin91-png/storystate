import test from "node:test";
import assert from "node:assert/strict";
import {
  localExtractorConfigAvailable,
  RAG_BENCHMARK_CASE_IDS,
  runRagBenchmarkCase,
} from "../lib/rag/benchmark";

test("local RAG benchmark covers the frozen 12 cases and six groups", async () => {
  assert.deepEqual(RAG_BENCHMARK_CASE_IDS, [
    "R01", "R02", "R03", "R04", "R05", "R06",
    "R07", "R08", "R09", "R10", "R11", "R12",
  ]);
  const results = [];
  for (const caseId of RAG_BENCHMARK_CASE_IDS) {
    results.push(await runRagBenchmarkCase(caseId, "rag"));
  }
  assert.equal(new Set(results.map(value => value.group)).size, 6);
  assert.ok(results.every(value => value.safetyPass));
  assert.ok(results.every(value => value.historicalEvidenceLeakage === 0));
  assert.ok(results.every(value => value.canonicalMutationSafe));
  assert.ok(results.every(value => value.extractorInputShapeValid));
  assert.ok(results.every(value => value.retrievalHitCorrectness === true));
  const baseline = await runRagBenchmarkCase("R01", "baseline");
  assert.equal(baseline.extractorInputShapeValid, true);
  assert.equal(baseline.retrievalHitCorrectness, null);
});

test("benchmark does not treat unavailable local provider configuration as live A/B authorization", () => {
  assert.equal(localExtractorConfigAvailable({
    STORYSTATE_EXTRACTOR_API_KEY: "[SENSITIVE]",
    STORYSTATE_EXTRACTOR_ENDPOINT: "https://api.deepseek.com/chat/completions",
    STORYSTATE_EXTRACTOR_MODEL: "deepseek-flash",
  } as Record<string, string>), false);
  assert.equal(localExtractorConfigAvailable({
    STORYSTATE_EXTRACTOR_API_KEY: "local-key",
    STORYSTATE_EXTRACTOR_ENDPOINT: "https://api.deepseek.com/chat/completions",
    STORYSTATE_EXTRACTOR_MODEL: "deepseek-flash",
  } as Record<string, string>), true);
});
