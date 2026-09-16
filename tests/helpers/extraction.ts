import { extractionEffectSchema, type ExtractionEffect, type ExtractionProposal } from "../../lib/extraction/contract";
import type { GoldEffect } from "../../lib/eval/extraction/contract";

const common = { eventKey: "EV", evidenceKeys: ["E"], supportKinds: ["direct_observation"], supportSummary: "Deterministic extraction test fixture.", confidence: 0.5 };
export function effectFromGold(gold: GoldEffect): ExtractionEffect {
  let value: unknown;
  switch (gold.kind) {
    case "character_location": value = { ...common, kind: gold.kind, characterRef: gold.semanticTarget.characterRef, after: gold.expectedAfter }; break;
    case "item_holder":
    case "item_owner":
    case "item_custodian": value = { ...common, kind: gold.kind, itemRef: gold.semanticTarget.itemRef, after: gold.expectedAfter }; break;
    case "item_condition": value = { ...common, kind: gold.kind, itemRef: gold.semanticTarget.itemRef, condition: gold.expectedAfter.condition }; break;
    case "knowledge_state": value = { ...common, kind: gold.kind, characterRef: gold.semanticTarget.characterRef, propositionRef: gold.semanticTarget.propositionRef, ...gold.expectedAfter }; break;
    case "world_truth_status": value = { ...common, kind: gold.kind, propositionRef: gold.semanticTarget.propositionRef, ...gold.expectedAfter }; break;
    case "plot_thread_status": value = { ...common, kind: gold.kind, threadRef: gold.semanticTarget.threadRef, ...gold.expectedAfter }; break;
    case "relationship_value": value = { ...common, kind: gold.kind, relationshipRef: gold.semanticTarget.relationshipRef, ...gold.expectedAfter }; break;
  }
  return extractionEffectSchema.parse(value);
}

export function proposalFor(gold: GoldEffect, effect = effectFromGold(gold), quote = gold.requiredEvidence[0].quote): ExtractionProposal {
  return {
    evidence: [{ key: "E", quote, occurrence: gold.requiredEvidence[0].occurrence, speakerRef: null }],
    events: [{ key: "EV", kind: "observation", participantRefs: [], evidenceKeys: ["E"] }],
    effects: [effect], unresolvedMentions: [],
  };
}
