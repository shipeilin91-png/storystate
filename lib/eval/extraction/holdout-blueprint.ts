import { deepFreeze, digest } from "../contract";

export const extractionHoldoutBlueprint = deepFreeze({
  version: "stage-2.3a/holdout-blueprint-v0.1",
  actualCasesIncluded: 0,
  totalCases: 20,
  groups: {
    temporalLocation: 4,
    itemState: 3,
    knowledgeBelief: 4,
    reportedProposition: 2,
    plot: 2,
    worldTruth: 1,
    relationship: 2,
    pureNegative: 2,
  },
  minimumProperties: {
    minimalPairRelationships: 6,
    trapOpportunities: 8,
    highImpactGoldEffects: 5,
    lowImpactGoldEffects: 5,
    zeroEffectOrPartialNegativePassages: 5,
    multiFactPartialStateChangePassages: 4,
    currentCanonicalStateRequiredCases: 3,
  },
  universeRules: [
    "Use new characters, items, locations, plot question, and phrasing.",
    "Test the same semantic capabilities without merely renaming the 北岬站 universe.",
  ],
  authoringProtocol: [
    "Product Owner freezes Extraction Contract, Compiler Spec, Holdout Blueprint, and metric rules.",
    "Development implementation and prompt work use the Development Set only.",
    "Extractor prompt and code freeze before Holdout authoring.",
    "A separate authoring agent creates Holdout cases after prompt freeze.",
    "Product Owner reviews logical correctness before any model run.",
    "Freeze the Holdout dataset hash before official evaluation.",
    "Official evaluation runs only after the dataset freeze.",
    "Prompt tuning after a consumed Holdout requires a new future Holdout.",
  ],
  authorMustNotReceive: [
    "model outputs",
    "Development failure analysis",
    "known prompt weaknesses",
    "official evaluation results",
  ],
});

export const holdoutBlueprintHash = digest(extractionHoldoutBlueprint);
