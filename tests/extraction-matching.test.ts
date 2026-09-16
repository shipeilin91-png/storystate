import test from "node:test";
import assert from "node:assert/strict";
import { extractionProposalSchema, type ExtractionEffect } from "../lib/extraction/contract";
import type { GoldEffect } from "../lib/eval/extraction/contract";
import { effectComparisonKey, evidenceSupportForMatch, matchEffects, matchForbiddenEffects, normalizeExtractionText, resolveEvidenceSpan } from "../lib/eval/extraction/matching";
import { extractionDevelopmentDataset } from "./fixtures/extraction-development";
import { effectFromGold, proposalFor } from "./helpers/extraction";

const byId = (id: string) => extractionDevelopmentDataset.cases.find(value => value.caseId === id)!;

test("deterministic matching is one-to-one and exact entity/stance/kind errors produce FP + FN", () => {
  const d04 = byId("D04"), exact = effectFromGold(d04.goldEffects[0]);
  assert.deepEqual(matchEffects([exact], d04.goldEffects), { matches: [{ proposalIndex: 0, goldIndex: 0 }], truePositive: 1, falsePositive: 0, falseNegative: 0, unmatchedProposalIndices: [], unmatchedGoldIndices: [] });
  const wrongEntity = { ...exact, itemRef: "ITEM_NORTH_KEY" } as ExtractionEffect;
  assert.deepEqual(matchEffects([wrongEntity], d04.goldEffects).truePositive, 0);
  assert.deepEqual([matchEffects([wrongEntity], d04.goldEffects).falsePositive, matchEffects([wrongEntity], d04.goldEffects).falseNegative], [1, 1]);
  const wrongKind = { ...exact, kind: "item_owner" } as ExtractionEffect;
  assert.deepEqual([matchEffects([wrongKind], d04.goldEffects).falsePositive, matchEffects([wrongKind], d04.goldEffects).falseNegative], [1, 1]);
  const d08 = byId("D08"), suspicion = effectFromGold(d08.goldEffects[0]);
  const wrongStance = { ...suspicion, stance: "believes", believedValue: true } as ExtractionEffect;
  assert.deepEqual([matchEffects([wrongStance], d08.goldEffects).falsePositive, matchEffects([wrongStance], d08.goldEffects).falseNegative], [1, 1]);
});

test("duplicate predictions count as one match plus an extra false positive", () => {
  const d04 = byId("D04"), effect = effectFromGold(d04.goldEffects[0]);
  const result = matchEffects([effect, structuredClone(effect)], d04.goldEffects);
  assert.deepEqual([result.truePositive, result.falsePositive, result.falseNegative], [1, 1, 0]);
});

test("normalization allows Unicode/whitespace/terminal punctuation but never semantic paraphrase", () => {
  assert.equal(normalizeExtractionText("  Ａ   B。 "), "A B");
  const d11 = byId("D11"), exact = effectFromGold(d11.goldEffects[0]);
  const formatted = { ...exact, resolution: "  顾屿切断了主配电。  " } as ExtractionEffect;
  assert.equal(matchEffects([formatted], d11.goldEffects).truePositive, 1);
  const paraphrase = { ...exact, resolution: "主配电被顾屿关闭" } as ExtractionEffect;
  assert.deepEqual([matchEffects([paraphrase], d11.goldEffects).falsePositive, matchEffects([paraphrase], d11.goldEffects).falseNegative], [1, 1]);
});

test("Forbidden Effects use the same deterministic semantic keys", () => {
  const d04 = byId("D04"), holder = effectFromGold(d04.goldEffects[0]);
  const owner = { ...holder, kind: "item_owner" } as ExtractionEffect;
  assert.equal(matchForbiddenEffects([holder], d04.forbiddenEffects).length, 0);
  assert.deepEqual(matchForbiddenEffects([owner], d04.forbiddenEffects).map(value => value.boundary), ["holder_vs_owner"]);
});

test("exact Evidence Resolution and semantic Evidence Support remain separate", () => {
  const d11 = byId("D11"), effect = effectFromGold(d11.goldEffects[0]);
  const supported = proposalFor(d11.goldEffects[0], effect);
  assert.ok(resolveEvidenceSpan(d11.passage, supported.evidence[0]));
  assert.equal(evidenceSupportForMatch(supported, effect, d11.goldEffects[0]), true);
  const merelyResolvable = proposalFor(d11.goldEffects[0], effect, "监控日志同时记录了他的门禁卡在断电前进入配电室");
  assert.ok(resolveEvidenceSpan(d11.passage, merelyResolvable.evidence[0]));
  assert.equal(evidenceSupportForMatch(merelyResolvable, effect, d11.goldEffects[0]), false);
  assert.equal(resolveEvidenceSpan(d11.passage, { ...supported.evidence[0], occurrence: 1 }), null);
});

test("Evidence Support enforces all required spans while preserving any semantics", () => {
  const d06 = byId("D06"), gold = d06.goldEffects[0], baseEffect = effectFromGold(gold);
  assert.equal(gold.evidenceRequirement, "all");
  assert.equal(gold.requiredEvidence.length, 2);
  const oneSpan = proposalFor(gold, baseEffect, gold.requiredEvidence[0].quote);
  assert.equal(evidenceSupportForMatch(oneSpan, baseEffect, gold), false);

  const bothEffect = { ...baseEffect, evidenceKeys: ["E1", "E2"] } as ExtractionEffect;
  const bothSpans = extractionProposalSchema.parse({
    evidence: gold.requiredEvidence.map((required, index) => ({ key: `E${index + 1}`, speakerRef: null, ...required })),
    events: [{ key: "EV", kind: "disclosure", participantRefs: ["CHAR_CHENG", "CHAR_TANG"], evidenceKeys: ["E1", "E2"] }],
    effects: [bothEffect], unresolvedMentions: [],
  });
  assert.equal(evidenceSupportForMatch(bothSpans, bothEffect, gold), true);

  const anyGold: GoldEffect = { ...gold, evidenceRequirement: "any" };
  assert.equal(evidenceSupportForMatch(oneSpan, baseEffect, anyGold), true);
});

test("custodian null and epistemic unresolved remain distinct deterministic values", () => {
  const common = { kind: "item_custodian" as const, itemRef: "ITEM_RECORDER", eventKey: "EV", evidenceKeys: ["E"], supportKinds: ["direct_observation" as const], supportSummary: "Custodian state changed.", confidence: 0.5 };
  const cleared: ExtractionEffect = { ...common, after: null };
  const unresolved: ExtractionEffect = { ...common, after: { valueRef: null, status: "unresolved", lastConfirmedValueRef: "CHAR_JI" } };
  assert.notEqual(effectComparisonKey(cleared), effectComparisonKey(unresolved));
});
