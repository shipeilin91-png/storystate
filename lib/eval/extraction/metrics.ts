import type { CanonicalState } from "../../domain/state";
import type { ExtractionEffect, ExtractionProposal } from "../../extraction/contract";
import type { AliasEntry, ExtractionDevelopmentCase } from "./contract";
import { evidenceSupportForMatch, matchEffects, matchForbiddenEffects, resolveEvidenceSpan } from "./matching";

export type CompilerRejection = { effect: ExtractionEffect; correctlyRejectedUnsafe: boolean; rejectedGoldEffect: boolean };
export type ExtractionCaseEvaluation = {
  benchmarkCase: ExtractionDevelopmentCase;
  proposal: ExtractionProposal;
  compiledEffects: ExtractionEffect[];
  compilerRejections: CompilerRejection[];
};
export type HarnessPersistenceCounters = { invalidPersistedDeltaCount: number; directCanonicalMutationCount: number };

const ratio = (numerator: number, denominator: number) => denominator === 0 ? 0 : numerator / denominator;
const f1 = (precision: number, recall: number) => precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall);

function aliasId(catalog: readonly AliasEntry[], alias: string, kind: AliasEntry["kind"]): string | null {
  return catalog.find(value => value.alias === alias && value.kind === kind)?.id ?? null;
}
export function isHighImpactExtractionEffect(effect: ExtractionEffect, baseState: CanonicalState, catalog: readonly AliasEntry[]): boolean {
  if (effect.kind === "item_owner") return true;
  if (effect.kind === "world_truth_status" && effect.status !== "unresolved") return true;
  if (effect.kind === "plot_thread_status" && effect.status === "resolved") return true;
  if (effect.kind === "knowledge_state") {
    if (effect.stance === "knows") return true;
    const characterId = aliasId(catalog, effect.characterRef, "character"), propositionId = aliasId(catalog, effect.propositionRef, "proposition");
    const current = baseState.knowledge.find(value => value.characterId === characterId && value.propositionId === propositionId);
    return Boolean(current && (current.stance !== effect.stance || current.believedValue !== effect.believedValue));
  }
  if (effect.kind === "relationship_value") {
    const relationshipId = aliasId(catalog, effect.relationshipRef, "relationship");
    return baseState.relationships.find(value => value.id === relationshipId)?.category === "human_confirmed_psychological";
  }
  return false;
}

export function calculateExtractionMetrics(evaluations: readonly ExtractionCaseEvaluation[], catalog: readonly AliasEntry[], persistence: HarnessPersistenceCounters) {
  let proposalTp = 0, proposalFp = 0, proposalFn = 0;
  let compiledTp = 0, compiledFp = 0, compiledFn = 0;
  let evidenceResolved = 0, evidenceTotal = 0, evidenceSupported = 0, evidenceEvaluated = 0;
  let negativeCases = 0, negativeCasesWithFp = 0, compiledNegativeCasesWithFp = 0;
  let boundaryViolationCount = 0, compiledBoundaryViolationCount = 0, boundaryOpportunities = 0;
  let highImpactFalseProposalCount = 0, highImpactFalseCompiledEffectCount = 0;
  let compilerRejectedEffectCount = 0, correctlyRejectedUnsafeEffectCount = 0, incorrectlyRejectedGoldEffectCount = 0;

  for (const evaluation of evaluations) {
    const { benchmarkCase, proposal, compiledEffects, compilerRejections } = evaluation;
    const proposed = matchEffects(proposal.effects, benchmarkCase.goldEffects);
    const compiled = matchEffects(compiledEffects, benchmarkCase.goldEffects);
    proposalTp += proposed.truePositive; proposalFp += proposed.falsePositive; proposalFn += proposed.falseNegative;
    compiledTp += compiled.truePositive; compiledFp += compiled.falsePositive; compiledFn += compiled.falseNegative;
    for (const evidence of proposal.evidence) { evidenceTotal++; if (resolveEvidenceSpan(benchmarkCase.passage, evidence)) evidenceResolved++; }
    for (const match of proposed.matches) {
      evidenceEvaluated++;
      if (evidenceSupportForMatch(proposal, proposal.effects[match.proposalIndex], benchmarkCase.goldEffects[match.goldIndex])) evidenceSupported++;
    }
    if (benchmarkCase.goldEffects.length === 0) {
      negativeCases++;
      if (proposal.effects.length > 0) negativeCasesWithFp++;
      if (compiledEffects.length > 0) compiledNegativeCasesWithFp++;
    }
    boundaryOpportunities += benchmarkCase.forbiddenEffects.length;
    boundaryViolationCount += matchForbiddenEffects(proposal.effects, benchmarkCase.forbiddenEffects).length;
    compiledBoundaryViolationCount += matchForbiddenEffects(compiledEffects, benchmarkCase.forbiddenEffects).length;
    highImpactFalseProposalCount += proposed.unmatchedProposalIndices.filter(index => isHighImpactExtractionEffect(proposal.effects[index], benchmarkCase.baseState, catalog)).length;
    highImpactFalseCompiledEffectCount += compiled.unmatchedProposalIndices.filter(index => isHighImpactExtractionEffect(compiledEffects[index], benchmarkCase.baseState, catalog)).length;
    compilerRejectedEffectCount += compilerRejections.length;
    correctlyRejectedUnsafeEffectCount += compilerRejections.filter(value => value.correctlyRejectedUnsafe).length;
    incorrectlyRejectedGoldEffectCount += compilerRejections.filter(value => value.rejectedGoldEffect).length;
  }
  const proposalEffectPrecision = ratio(proposalTp, proposalTp + proposalFp), proposalEffectRecall = ratio(proposalTp, proposalTp + proposalFn);
  const compiledEffectPrecision = ratio(compiledTp, compiledTp + compiledFp), compiledEffectRecall = ratio(compiledTp, compiledTp + compiledFn);
  return {
    proposalEffectPrecision, proposalEffectRecall, proposalEffectF1: f1(proposalEffectPrecision, proposalEffectRecall),
    compiledEffectPrecision, compiledEffectRecall, compiledEffectF1: f1(compiledEffectPrecision, compiledEffectRecall),
    evidenceResolutionRate: ratio(evidenceResolved, evidenceTotal),
    evidenceSupportAccuracy: ratio(evidenceSupported, evidenceEvaluated),
    negativeCaseFalsePositiveRate: ratio(negativeCasesWithFp, negativeCases),
    compiledNegativeCaseFalsePositiveRate: ratio(compiledNegativeCasesWithFp, negativeCases),
    boundaryViolationCount, boundaryViolationRate: ratio(boundaryViolationCount, boundaryOpportunities),
    compiledBoundaryViolationCount, compiledBoundaryViolationRate: ratio(compiledBoundaryViolationCount, boundaryOpportunities),
    highImpactFalseProposalCount, highImpactFalseCompiledEffectCount,
    compilerRejectedEffectCount, correctlyRejectedUnsafeEffectCount, incorrectlyRejectedGoldEffectCount,
    invalidPersistedDeltaCount: persistence.invalidPersistedDeltaCount,
    directCanonicalMutationCount: persistence.directCanonicalMutationCount,
    counts: { proposalTp, proposalFp, proposalFn, compiledTp, compiledFp, compiledFn, evidenceResolved, evidenceTotal, evidenceSupported, evidenceEvaluated, negativeCases, negativeCasesWithFp, compiledNegativeCasesWithFp },
  };
}

export const extractionEvaluationDecisionRules = {
  passToRuntimePilot: {
    compiledPrecision: { operator: ">=", value: 0.85 },
    compiledRecall: { operator: ">=", value: 0.70 },
    highImpactFalseCompiledEffects: { operator: "==", value: 0 },
    invalidPersistedDeltas: { operator: "==", value: 0 },
    exactPersistedEvidenceSpans: { operator: "==", value: 1 },
    directCanonicalMutations: { operator: "==", value: 0 },
  },
  conservativeReviewMode: {
    compiledPrecision: { operator: ">=", value: 0.85 },
    compiledRecallLower: { operator: ">=", value: 0.55 },
    compiledRecallUpper: { operator: "<", value: 0.70 },
    highImpactFalseCompiledEffects: { operator: "==", value: 0 },
  },
  manualArchitectureReview: {
    compiledPrecisionLower: { operator: ">=", value: 0.80 },
    compiledPrecisionUpper: { operator: "<", value: 0.85 },
  },
  failIf: {
    compiledPrecision: { operator: "<", value: 0.80 },
    highImpactFalseCompiledEffects: { operator: ">", value: 0 },
    invalidPersistedDeltas: { operator: ">", value: 0 },
    directCanonicalMutations: { operator: ">", value: 0 },
  },
} as const;

export type ExtractionDecisionInput = {
  compiledPrecision: number;
  compiledRecall: number;
  highImpactFalseCompiledEffects: number;
  invalidPersistedDeltas: number;
  exactPersistedEvidenceSpans: number;
  directCanonicalMutations: number;
};

export function evaluateExtractionDecisionRules(input: ExtractionDecisionInput) {
  const safetyFailure = input.highImpactFalseCompiledEffects > 0
    || input.invalidPersistedDeltas > 0
    || input.directCanonicalMutations > 0;
  return {
    passToRuntimePilot: input.compiledPrecision >= 0.85
      && input.compiledRecall >= 0.70
      && input.highImpactFalseCompiledEffects === 0
      && input.invalidPersistedDeltas === 0
      && input.exactPersistedEvidenceSpans === 1
      && input.directCanonicalMutations === 0,
    conservativeReviewMode: input.compiledPrecision >= 0.85
      && input.compiledRecall >= 0.55
      && input.compiledRecall < 0.70
      && input.highImpactFalseCompiledEffects === 0,
    manualArchitectureReview: input.compiledPrecision >= 0.80 && input.compiledPrecision < 0.85,
    fail: input.compiledPrecision < 0.80 || safetyFailure,
  };
}
