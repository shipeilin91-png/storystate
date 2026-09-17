import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  blueprintPrompt, directPrompt, hash, oracleReplay, outlineCases,
  rawOutlineMetrics, retrieveHistory, stateOpportunities, stateScale, stateSequences, storyStatePrompt,
} from "../eval/resume-benchmark/benchmark";

test("frozen state dataset meets long-horizon scale and split", () => {
  assert.deepEqual(stateScale(), { stories: 3, revisions: 20, expectedChanges: 60, expectedNoChange: 200, invalidOpportunities: 20 });
  assert.equal(stateSequences.filter(story => story.set === "development").length, 1);
  assert.equal(stateSequences.filter(story => story.set === "holdout").length, 2);
  for (const story of stateSequences) {
    assert.ok(story.revisions.length >= 6);
    assert.deepEqual(story.revisions.map(revision => revision.order), Array.from({ length: story.revisions.length }, (_, index) => index + 1));
  }
});

test("every state opportunity is complete and exact evidence spans are literal", () => {
  assert.equal(stateOpportunities.length, 260);
  for (const story of stateSequences) for (const revision of story.revisions) {
    assert.equal(revision.changes.length, 3);
    assert.equal(new Set(revision.changes.map(change => change.fieldId)).size, 3);
    for (const change of revision.changes)
      assert.equal(revision.content.slice(change.start, change.end), change.evidence);
  }
});

test("outline dataset is balanced and Gold is human-authored", () => {
  assert.equal(outlineCases.length, 24);
  assert.equal(outlineCases.filter(item => item.set === "development").length, 6);
  assert.equal(outlineCases.filter(item => item.set === "holdout").length, 18);
  for (const quality of ["sparse", "medium", "detailed"])
    assert.equal(outlineCases.filter(item => item.quality === quality).length, 8);
  assert.ok(outlineCases.every(item => item.goldFields.length === 8 && item.goldFields.every(field => field.rationale.startsWith("Human-authored Gold:"))));
});

test("model prompts contain no Gold labels or expected-result objects", () => {
  const story = stateSequences[0], revision = story.revisions[0];
  for (const prompt of [directPrompt(story, revision, story.initialState), storyStatePrompt(story, revision, story.initialState, []), blueprintPrompt(outlineCases[0])]) {
    const serialized = JSON.stringify(prompt);
    for (const forbidden of ["goldFinalState", "invalidCandidates", "expectedChanges", "explicitFieldKeys", "shouldNotTrack"])
      assert.ok(!serialized.includes(forbidden), forbidden);
  }
});

test("evaluation-only retrieval is deterministic and never retrieves the current revision", () => {
  const story = stateSequences[1], current = story.revisions[4];
  const first = retrieveHistory(story, current.order, current.content), second = retrieveHistory(story, current.order, current.content);
  assert.deepEqual(first, second);
  assert.ok(first.length <= 4);
  assert.ok(!first.includes(current.content));
});

test("deterministic oracle validates scorer without becoming a model result", () => {
  const first = oracleReplay(), second = oracleReplay();
  assert.equal(hash(first), hash(second));
  assert.equal(first.status, "DETERMINISTIC_ORACLE_REPLAY_ONLY");
  assert.ok(first.perStory.every(row => row.finalCorrect === row.finalTotal));
  assert.ok(first.perStory.every(row => row.correctChanges === row.expectedChanges));
  assert.ok(first.perStory.every(row => row.drift === 0 && row.invalidEscapes === 0));
});

test("raw outline metric is an exact Gold mapping baseline", () => {
  const metric = rawOutlineMetrics();
  assert.deepEqual({ outlines: metric.outlines, numerator: metric.numerator, denominator: metric.denominator, humanAddOperations: metric.humanAddOperations }, { outlines: 18, numerator: 90, denominator: 144, humanAddOperations: 54 });
  assert.equal(metric.rate, 0.625);
  assert.deepEqual(Object.fromEntries(Object.entries(metric.byQuality).map(([key, value]) => [key, [value.numerator, value.denominator]])), { sparse: [18, 48], medium: [30, 48], detailed: [42, 48] });
});

test("generated manifests are frozen, separate, and reproducible", () => {
  const dataset = JSON.parse(readFileSync("docs/evaluation/resume-benchmark/DATASET_MANIFEST.json", "utf8"));
  const gold = JSON.parse(readFileSync("docs/evaluation/resume-benchmark/GOLD_MANIFEST.json", "utf8"));
  assert.equal(dataset.status, "FROZEN_BEFORE_MODEL_RUN");
  assert.equal(gold.status, "HUMAN_AUTHORED_FROZEN_GOLD");
  assert.ok(!JSON.stringify(dataset).includes("invalidCandidates"));
  assert.ok(!JSON.stringify(dataset).includes("goldFinalState"));
  const datasetHash = dataset.datasetHash; delete dataset.datasetHash;
  const goldHash = gold.goldHash; delete gold.goldHash;
  assert.equal(hash(dataset), datasetHash);
  assert.equal(hash(gold), goldHash);
});
