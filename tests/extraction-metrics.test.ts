import test from "node:test";
import assert from "node:assert/strict";
import { extractionProposalSchema, type ExtractionEffect } from "../lib/extraction/contract";
import { calculateExtractionMetrics, evaluateExtractionDecisionRules, extractionEvaluationDecisionRules, isHighImpactExtractionEffect } from "../lib/eval/extraction/metrics";
import { extractionDevelopmentDataset } from "./fixtures/extraction-development";
import { effectFromGold, proposalFor } from "./helpers/extraction";

const byId = (id: string) => extractionDevelopmentDataset.cases.find(value => value.caseId === id)!;

test("proposal and compiled metrics remain distinct while compiler rejection stays separately auditable", () => {
  const d04 = byId("D04"), holder = effectFromGold(d04.goldEffects[0]);
  const owner = { ...holder, kind: "item_owner" } as ExtractionEffect;
  const proposalD04 = extractionProposalSchema.parse({ ...proposalFor(d04.goldEffects[0], holder), effects: [holder, owner] });
  const d02 = byId("D02"), forbidden = d02.forbiddenEffects[0];
  assert.equal(forbidden.kind, "character_location");
  if (forbidden.kind !== "character_location") throw new Error("D02 contract drift");
  const directionFalsePositive: ExtractionEffect = {
    kind: "character_location", eventKey: "EV", evidenceKeys: ["E"], supportKinds: ["inference"], supportSummary: "Direction incorrectly treated as arrival.", confidence: 0.5,
    characterRef: forbidden.semanticTarget.characterRef, after: forbidden.forbiddenAfter,
  };
  const proposalD02 = extractionProposalSchema.parse({
    evidence: [{ key: "E", quote: "等会儿过去看看", occurrence: 0, speakerRef: null }],
    events: [{ key: "EV", kind: "movement", participantRefs: ["CHAR_JI"], evidenceKeys: ["E"] }],
    effects: [directionFalsePositive], unresolvedMentions: [],
  });
  const metrics = calculateExtractionMetrics([
    { benchmarkCase: d04, proposal: proposalD04, compiledEffects: [holder], compilerRejections: [{ effect: owner, correctlyRejectedUnsafe: true, rejectedGoldEffect: false }] },
    { benchmarkCase: d02, proposal: proposalD02, compiledEffects: [], compilerRejections: [{ effect: directionFalsePositive, correctlyRejectedUnsafe: true, rejectedGoldEffect: false }] },
  ], extractionDevelopmentDataset.catalog, { invalidPersistedDeltaCount: 0, directCanonicalMutationCount: 0 });
  assert.equal(metrics.proposalEffectPrecision, 1 / 3);
  assert.equal(metrics.proposalEffectRecall, 1);
  assert.equal(metrics.compiledEffectPrecision, 1);
  assert.equal(metrics.compiledEffectRecall, 1);
  assert.equal(metrics.boundaryViolationCount, 2);
  assert.equal(metrics.compiledBoundaryViolationCount, 0);
  assert.equal(metrics.compiledBoundaryViolationRate, 0);
  assert.equal(metrics.negativeCaseFalsePositiveRate, 1);
  assert.equal(metrics.compiledNegativeCaseFalsePositiveRate, 0);
  assert.equal(metrics.highImpactFalseProposalCount, 1);
  assert.equal(metrics.compilerRejectedEffectCount, 2);
  assert.equal(metrics.correctlyRejectedUnsafeEffectCount, 2);
  assert.equal(metrics.incorrectlyRejectedGoldEffectCount, 0);
  assert.equal(metrics.evidenceResolutionRate, 1);
  assert.equal(metrics.evidenceSupportAccuracy, 1);
});

test("decision rule boundaries use explicit non-overlapping precision and recall comparisons", () => {
  const evaluate = (compiledPrecision: number, compiledRecall: number) => evaluateExtractionDecisionRules({
    compiledPrecision, compiledRecall, highImpactFalseCompiledEffects: 0,
    invalidPersistedDeltas: 0, exactPersistedEvidenceSpans: 1, directCanonicalMutations: 0,
  });
  assert.deepEqual([evaluate(0.7999, 0.70).fail, evaluate(0.7999, 0.70).manualArchitectureReview], [true, false]);
  assert.deepEqual([evaluate(0.80, 0.70).fail, evaluate(0.80, 0.70).manualArchitectureReview], [false, true]);
  assert.equal(evaluate(0.8499, 0.70).manualArchitectureReview, true);
  assert.deepEqual([evaluate(0.85, 0.70).manualArchitectureReview, evaluate(0.85, 0.70).passToRuntimePilot], [false, true]);

  assert.deepEqual([evaluate(0.85, 0.5499).conservativeReviewMode, evaluate(0.85, 0.5499).passToRuntimePilot], [false, false]);
  assert.deepEqual([evaluate(0.85, 0.55).conservativeReviewMode, evaluate(0.85, 0.55).passToRuntimePilot], [true, false]);
  assert.deepEqual([evaluate(0.85, 0.6999).conservativeReviewMode, evaluate(0.85, 0.6999).passToRuntimePilot], [true, false]);
  assert.deepEqual([evaluate(0.85, 0.70).conservativeReviewMode, evaluate(0.85, 0.70).passToRuntimePilot], [false, true]);
  assert.equal(extractionEvaluationDecisionRules.manualArchitectureReview.compiledPrecisionUpper.operator, "<");
  assert.equal(extractionEvaluationDecisionRules.conservativeReviewMode.compiledRecallUpper.operator, "<");
});

test("safety failures dominate conservative and manual classifications", () => {
  const base = {
    compiledPrecision: 0.90, compiledRecall: 0.60,
    highImpactFalseCompiledEffects: 0, invalidPersistedDeltas: 0,
    exactPersistedEvidenceSpans: 1, directCanonicalMutations: 0,
  };
  const cases = [
    { ...base, invalidPersistedDeltas: 1 },
    { ...base, compiledPrecision: 0.82, compiledRecall: 0.70, highImpactFalseCompiledEffects: 1 },
    { ...base, directCanonicalMutations: 1 },
  ];
  for (const input of cases) {
    const classification = evaluateExtractionDecisionRules(input);
    assert.deepEqual(classification, {
      passToRuntimePilot: false,
      conservativeReviewMode: false,
      manualArchitectureReview: false,
      fail: true,
    });
    assert.equal(Object.values(classification).filter(Boolean).length, 1);
  }
});

test("high-impact classifier covers owner, knowledge/reversal, truth, resolved plot and psychological relationship", () => {
  const catalog = extractionDevelopmentDataset.catalog, base = byId("D09").baseState;
  const owner = effectFromGold(byId("D05").goldEffects.find(value => value.kind === "item_owner")!);
  const knows = effectFromGold(byId("D06").goldEffects[0]);
  const correction = { ...knows, characterRef: "CHAR_JI", propositionRef: "PROP_SHORT", stance: "believes", believedValue: false } as ExtractionEffect;
  const truth = effectFromGold(byId("D09").goldEffects.find(value => value.kind === "world_truth_status")!);
  const resolved = effectFromGold(byId("D11").goldEffects[0]);
  const psychological = { ...effectFromGold(byId("D12").goldEffects[0]), relationshipRef: "REL_TRUST" } as ExtractionEffect;
  for (const effect of [owner, knows, correction, truth, resolved, psychological]) assert.equal(isHighImpactExtractionEffect(effect, base, catalog), true, effect.kind);
  assert.equal(isHighImpactExtractionEffect(effectFromGold(byId("D04").goldEffects[0]), base, catalog), false);
});

test("empty metric denominators return finite zeroes and persistence counters are harness-supplied", () => {
  const metrics = calculateExtractionMetrics([], extractionDevelopmentDataset.catalog, { invalidPersistedDeltaCount: 3, directCanonicalMutationCount: 2 });
  for (const [key, value] of Object.entries(metrics)) if (typeof value === "number") assert.ok(Number.isFinite(value), key);
  assert.equal(metrics.proposalEffectPrecision, 0);
  assert.equal(metrics.compiledEffectF1, 0);
  assert.equal(metrics.invalidPersistedDeltaCount, 3);
  assert.equal(metrics.directCanonicalMutationCount, 2);
});
