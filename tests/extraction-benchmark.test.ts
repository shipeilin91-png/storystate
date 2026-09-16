import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { validateCanonical } from "../lib/domain/governance";
import { digest } from "../lib/eval/contract";
import { extractionHoldoutBlueprint, holdoutBlueprintHash } from "../lib/eval/extraction/holdout-blueprint";
import { compilerSpecHash } from "../lib/extraction/compiler-spec";
import { extractionContractHash } from "../lib/extraction/contract";
import { resolveEvidenceSpan } from "../lib/eval/extraction/matching";
import { buildExtractionDevelopmentDataset, developmentDatasetHash, extractionDevelopmentDataset } from "./fixtures/extraction-development";

test("Development benchmark freezes exactly 14 cases and 14 Gold Effects", () => {
  const { cases, minimalPairs } = extractionDevelopmentDataset;
  assert.equal(cases.length, 14);
  assert.deepEqual(cases.map(value => value.caseId), Array.from({ length: 14 }, (_, index) => `D${String(index + 1).padStart(2, "0")}`));
  assert.equal(cases.reduce((sum, value) => sum + value.goldEffects.length, 0), 14);
  assert.equal(cases.find(value => value.caseId === "D02")?.goldEffects.length, 0);
  assert.equal(cases.find(value => value.caseId === "D14")?.goldEffects.length, 0);
  assert.equal(cases.find(value => value.caseId === "D05")?.goldEffects.length, 2);
  assert.equal(cases.find(value => value.caseId === "D09")?.goldEffects.length, 2);
  assert.equal(minimalPairs.length, 6);
  assert.deepEqual(minimalPairs.map(value => value.caseIds), [["D01", "D02"], ["D01", "D14"], ["D04", "D05"], ["D06", "D07"], ["D10", "D11"], ["D12", "D13"]]);
});

test("D02 remains in Maintenance Room and expresses future direction without a location transition", () => {
  const d02 = extractionDevelopmentDataset.cases.find(value => value.caseId === "D02")!;
  assert.equal(d02.passage, "纪川仍站在维修间门内，朝控制室方向看了一眼：“等会儿过去看看。”");
  assert.equal(d02.goldEffects.length, 0);
  const jiId = extractionDevelopmentDataset.catalog.find(value => value.alias === "CHAR_JI")!.id;
  assert.equal(d02.baseState.characters.find(value => value.id === jiId)!.location.value, "Maintenance Room");
  const forbidden = d02.forbiddenEffects[0];
  assert.equal(forbidden.kind, "character_location");
  if (forbidden.kind !== "character_location") throw new Error("D02 forbidden contract drift");
  assert.equal(forbidden.forbiddenAfter.value, "Control Room");
  assert.equal(forbidden.forbiddenAfter.status, "resolved");
  assert.equal(forbidden.boundary, "direction_vs_arrival");
  assert.deepEqual(extractionDevelopmentDataset.minimalPairs.find(value => value.pairId === "MP01")!.caseIds, ["D01", "D02"]);
  assert.match(d02.passage, /仍站在维修间门内/);
  assert.match(d02.passage, /等会儿/);
  assert.doesNotMatch(d02.passage, /离开|走出|冲出|进入|到达|抵达/);
});

test("every base Canonical State is valid and reported proposition remains distinct", () => {
  for (const benchmarkCase of extractionDevelopmentDataset.cases) validateCanonical(benchmarkCase.baseState);
  const state = extractionDevelopmentDataset.cases[0].baseState;
  const report = state.propositions.find(value => value.statement.startsWith("顾屿声称"))!;
  const underlying = state.propositions.find(value => value.statement === "备用线圈短路导致了停电")!;
  assert.equal(report.kind, "reported");
  assert.equal(report.reportedPropositionId, underlying.id);
  assert.notEqual(report.id, underlying.id);
});

test("Gold and Forbidden semantic targets reference exact known aliases", () => {
  const known = new Set(extractionDevelopmentDataset.catalog.map(value => value.alias));
  for (const benchmarkCase of extractionDevelopmentDataset.cases) for (const effect of [...benchmarkCase.goldEffects, ...benchmarkCase.forbiddenEffects]) {
    const refs = Object.values(effect.semanticTarget);
    assert.ok(refs.every(value => known.has(value)), `${benchmarkCase.caseId}/${effect.kind}`);
  }
});

test("every Gold-required evidence span resolves exactly inside its passage", () => {
  for (const benchmarkCase of extractionDevelopmentDataset.cases) for (const gold of benchmarkCase.goldEffects)
    for (const required of gold.requiredEvidence)
      assert.ok(resolveEvidenceSpan(benchmarkCase.passage, { key: "GOLD", speakerRef: null, ...required }), `${benchmarkCase.caseId}/${gold.effectId}`);
});

test("knowledge and relationship Gold evidence preserves actor and access context", () => {
  const byId = (caseId: string) => extractionDevelopmentDataset.cases.find(value => value.caseId === caseId)!;
  const d06 = byId("D06").goldEffects[0], d07 = byId("D07").goldEffects[0];
  assert.equal(d06.evidenceRequirement, "all");
  assert.deepEqual(d06.requiredEvidence.map(value => value.quote), ["程雾对唐岚说", "顾屿说停电是备用线圈短路造成的"]);
  assert.equal(d07.evidenceRequirement, "all");
  assert.deepEqual(d07.requiredEvidence.map(value => value.quote), ["程雾把检修报告递给唐岚", "备用线圈短路导致了停电"]);
  assert.match(byId("D01").goldEffects[0].requiredEvidence[0].quote, /^纪川/);
  assert.match(byId("D08").goldEffects[0].requiredEvidence[0].quote, /^纪川/);
  for (const caseId of ["D12", "D13"]) {
    const gold = byId(caseId).goldEffects[0];
    assert.equal(gold.evidenceRequirement, "all");
    assert.equal(gold.requiredEvidence[0].quote, "程雾对纪川说");
  }
});

test("development fixture is deterministic, deeply frozen and contains no random/time construction", async () => {
  const rebuilt = buildExtractionDevelopmentDataset();
  assert.equal(digest(rebuilt), developmentDatasetHash);
  assert.deepEqual(rebuilt, extractionDevelopmentDataset);
  assert.ok(Object.isFrozen(extractionDevelopmentDataset));
  assert.ok(Object.isFrozen(extractionDevelopmentDataset.cases[0].baseState.characters[0]));
  assert.throws(() => { (extractionDevelopmentDataset.cases as unknown as unknown[]).push({}); });
  const source = await readFile("tests/fixtures/extraction-development.ts", "utf8");
  assert.ok(!source.includes("randomUUID"));
  assert.ok(!source.includes("new Date"));
  assert.ok(!source.includes("Date.now"));
});

test("Stage 2.3A produces exactly four deterministic contract/spec/dataset/blueprint hashes", () => {
  for (const value of [extractionContractHash, compilerSpecHash, developmentDatasetHash, holdoutBlueprintHash]) assert.match(value, /^[a-f0-9]{64}$/);
  const lock = JSON.parse(readFileSync("tests/fixtures/extraction-stage-2.3a.lock.json", "utf8"));
  assert.deepEqual({ extractionContractHash, compilerSpecHash, developmentDatasetHash, holdoutBlueprintHash }, {
    extractionContractHash: lock.extractionContractHash,
    compilerSpecHash: lock.compilerSpecHash,
    developmentDatasetHash: lock.developmentDatasetHash,
    holdoutBlueprintHash: lock.holdoutBlueprintHash,
  });
  assert.equal(extractionHoldoutBlueprint.actualCasesIncluded, 0);
  assert.equal(extractionHoldoutBlueprint.totalCases, 20);
  assert.equal(Object.values(extractionHoldoutBlueprint.groups).reduce((sum, count) => sum + count, 0), 20);
});
