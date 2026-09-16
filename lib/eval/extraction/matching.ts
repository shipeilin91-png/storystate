import type { EvidenceProposal, ExtractionEffect, ExtractionProposal } from "../../extraction/contract";
import { EXTRACTION_TEXT_NORMALIZATION_VERSION } from "../../extraction/compiler-spec";
import type { ForbiddenEffect, GoldEffect } from "./contract";

export { EXTRACTION_TEXT_NORMALIZATION_VERSION };

export function normalizeExtractionText(value: string | null): string | null {
  if (value === null) return null;
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").replace(/[。！？!?.,，；;：:]+$/gu, "").trim();
}

function semanticParts(effect: ExtractionEffect): unknown[] {
  switch (effect.kind) {
    case "character_location": return [effect.kind, effect.characterRef, effect.after.status, normalizeExtractionText(effect.after.value), normalizeExtractionText(effect.after.lastConfirmedValue)];
    case "item_holder":
    case "item_owner": return [effect.kind, effect.itemRef, effect.after.status, effect.after.valueRef, effect.after.lastConfirmedValueRef];
    case "item_custodian": return effect.after === null
      ? [effect.kind, effect.itemRef, null]
      : [effect.kind, effect.itemRef, effect.after.status, effect.after.valueRef, effect.after.lastConfirmedValueRef];
    case "item_condition": return [effect.kind, effect.itemRef, normalizeExtractionText(effect.condition)];
    case "knowledge_state": return [effect.kind, effect.characterRef, effect.propositionRef, effect.stance, effect.believedValue];
    case "world_truth_status": return [effect.kind, effect.propositionRef, effect.status];
    case "plot_thread_status": return [effect.kind, effect.threadRef, effect.status, normalizeExtractionText(effect.resolution)];
    case "relationship_value": return [effect.kind, effect.relationshipRef, normalizeExtractionText(effect.value), normalizeExtractionText(effect.scope)];
  }
}

function goldParts(gold: GoldEffect): unknown[] {
  switch (gold.kind) {
    case "character_location": return [gold.kind, gold.semanticTarget.characterRef, gold.expectedAfter.status, normalizeExtractionText(gold.expectedAfter.value), normalizeExtractionText(gold.expectedAfter.lastConfirmedValue)];
    case "item_holder":
    case "item_owner": return [gold.kind, gold.semanticTarget.itemRef, gold.expectedAfter.status, gold.expectedAfter.valueRef, gold.expectedAfter.lastConfirmedValueRef];
    case "item_custodian": return gold.expectedAfter === null
      ? [gold.kind, gold.semanticTarget.itemRef, null]
      : [gold.kind, gold.semanticTarget.itemRef, gold.expectedAfter.status, gold.expectedAfter.valueRef, gold.expectedAfter.lastConfirmedValueRef];
    case "item_condition": return [gold.kind, gold.semanticTarget.itemRef, normalizeExtractionText(gold.expectedAfter.condition)];
    case "knowledge_state": return [gold.kind, gold.semanticTarget.characterRef, gold.semanticTarget.propositionRef, gold.expectedAfter.stance, gold.expectedAfter.believedValue];
    case "world_truth_status": return [gold.kind, gold.semanticTarget.propositionRef, gold.expectedAfter.status];
    case "plot_thread_status": return [gold.kind, gold.semanticTarget.threadRef, gold.expectedAfter.status, normalizeExtractionText(gold.expectedAfter.resolution)];
    case "relationship_value": return [gold.kind, gold.semanticTarget.relationshipRef, normalizeExtractionText(gold.expectedAfter.value), normalizeExtractionText(gold.expectedAfter.scope)];
  }
}

function forbiddenParts(forbidden: ForbiddenEffect): unknown[] {
  switch (forbidden.kind) {
    case "character_location": return [forbidden.kind, forbidden.semanticTarget.characterRef, forbidden.forbiddenAfter.status, normalizeExtractionText(forbidden.forbiddenAfter.value), normalizeExtractionText(forbidden.forbiddenAfter.lastConfirmedValue)];
    case "item_holder":
    case "item_owner": return [forbidden.kind, forbidden.semanticTarget.itemRef, forbidden.forbiddenAfter.status, forbidden.forbiddenAfter.valueRef, forbidden.forbiddenAfter.lastConfirmedValueRef];
    case "item_custodian": return forbidden.forbiddenAfter === null
      ? [forbidden.kind, forbidden.semanticTarget.itemRef, null]
      : [forbidden.kind, forbidden.semanticTarget.itemRef, forbidden.forbiddenAfter.status, forbidden.forbiddenAfter.valueRef, forbidden.forbiddenAfter.lastConfirmedValueRef];
    case "item_condition": return [forbidden.kind, forbidden.semanticTarget.itemRef, normalizeExtractionText(forbidden.forbiddenAfter.condition)];
    case "knowledge_state": return [forbidden.kind, forbidden.semanticTarget.characterRef, forbidden.semanticTarget.propositionRef, forbidden.forbiddenAfter.stance, forbidden.forbiddenAfter.believedValue];
    case "world_truth_status": return [forbidden.kind, forbidden.semanticTarget.propositionRef, forbidden.forbiddenAfter.status];
    case "plot_thread_status": return [forbidden.kind, forbidden.semanticTarget.threadRef, forbidden.forbiddenAfter.status, normalizeExtractionText(forbidden.forbiddenAfter.resolution)];
    case "relationship_value": return [forbidden.kind, forbidden.semanticTarget.relationshipRef, normalizeExtractionText(forbidden.forbiddenAfter.value), normalizeExtractionText(forbidden.forbiddenAfter.scope)];
  }
}

export function effectComparisonKey(effect: ExtractionEffect): string { return JSON.stringify(semanticParts(effect)); }
export function goldComparisonKey(gold: GoldEffect): string { return JSON.stringify(goldParts(gold)); }
export function forbiddenComparisonKey(forbidden: ForbiddenEffect): string { return JSON.stringify(forbiddenParts(forbidden)); }

export type EffectMatch = { proposalIndex: number; goldIndex: number };
export type EffectMatchResult = { matches: EffectMatch[]; truePositive: number; falsePositive: number; falseNegative: number; unmatchedProposalIndices: number[]; unmatchedGoldIndices: number[] };
export function matchEffects(proposals: readonly ExtractionEffect[], gold: readonly GoldEffect[]): EffectMatchResult {
  const available = new Set(gold.map((_, index) => index));
  const matches: EffectMatch[] = [];
  proposals.forEach((proposal, proposalIndex) => {
    const key = effectComparisonKey(proposal);
    const goldIndex = [...available].find(index => goldComparisonKey(gold[index]) === key);
    if (goldIndex !== undefined) { matches.push({ proposalIndex, goldIndex }); available.delete(goldIndex); }
  });
  const matchedProposals = new Set(matches.map(match => match.proposalIndex));
  const unmatchedProposalIndices = proposals.map((_, index) => index).filter(index => !matchedProposals.has(index));
  const unmatchedGoldIndices = [...available];
  return { matches, truePositive: matches.length, falsePositive: unmatchedProposalIndices.length, falseNegative: unmatchedGoldIndices.length, unmatchedProposalIndices, unmatchedGoldIndices };
}

export type ForbiddenMatch = { proposalIndex: number; forbiddenIndex: number; boundary: ForbiddenEffect["boundary"] };
export function matchForbiddenEffects(proposals: readonly ExtractionEffect[], forbidden: readonly ForbiddenEffect[]): ForbiddenMatch[] {
  const matches: ForbiddenMatch[] = [];
  proposals.forEach((proposal, proposalIndex) => forbidden.forEach((rule, forbiddenIndex) => {
    if (effectComparisonKey(proposal) === forbiddenComparisonKey(rule)) matches.push({ proposalIndex, forbiddenIndex, boundary: rule.boundary });
  }));
  return matches;
}

export function resolveEvidenceSpan(passage: string, evidence: EvidenceProposal): { start: number; end: number } | null {
  let from = 0, found = -1;
  for (let occurrence = 0; occurrence <= evidence.occurrence; occurrence++) {
    found = passage.indexOf(evidence.quote, from);
    if (found < 0) return null;
    from = found + evidence.quote.length;
  }
  return { start: found, end: found + evidence.quote.length };
}

export function evidenceSupportForMatch(proposal: ExtractionProposal, effect: ExtractionEffect, gold: GoldEffect): boolean {
  const used = effect.evidenceKeys.map(key => proposal.evidence.find(evidence => evidence.key === key)).filter((value): value is EvidenceProposal => Boolean(value));
  const supported = gold.requiredEvidence.map(required => used.some(evidence => evidence.quote === required.quote && evidence.occurrence === required.occurrence));
  return gold.evidenceRequirement === "all" ? supported.every(Boolean) : supported.some(Boolean);
}
