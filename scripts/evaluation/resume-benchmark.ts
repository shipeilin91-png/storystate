import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BENCHMARK_VERSION, blueprintPrompt, directPrompt, hash, oracleReplay,
  outlineCases, rawOutlineMetrics, stateOpportunities, stateScale, stateSequences, storyStatePrompt,
} from "../../eval/resume-benchmark/benchmark";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const output = join(root, "docs/evaluation/resume-benchmark");
const frozenAt = "2026-09-17T12:37:16Z";
mkdirSync(output, { recursive: true });
const writeJson = (name: string, value: unknown) => writeFileSync(join(output, name), `${JSON.stringify(value, null, 2)}\n`);
const writeText = (name: string, value: string) => writeFileSync(join(output, name), value.endsWith("\n") ? value : `${value}\n`);
const writeJsonl = (name: string, values: unknown[]) => writeFileSync(join(output, name), `${values.map(value => JSON.stringify(value)).join("\n")}\n`);

const dataset = {
  benchmarkVersion: BENCHMARK_VERSION,
  status: "FROZEN_BEFORE_MODEL_RUN",
  classification: "INTERNAL_SYNTHETIC_LONG_HORIZON_BENCHMARK",
  stateSync: stateSequences.map(story => ({
    id: story.id, set: story.set, title: story.title, initialState: story.initialState,
    revisions: story.revisions.map(({ id, order, content, aliases }) => ({ id, order, content, aliases })),
  })),
  outlines: outlineCases.map(({ id, set, quality, genre, outline }) => ({ id, set, quality, genre, outline })),
};
const gold = {
  benchmarkVersion: BENCHMARK_VERSION,
  status: "HUMAN_AUTHORED_FROZEN_GOLD",
  authoring: "Deterministic human-authored definitions; no tested model generated Gold.",
  stateSync: stateSequences.map(story => ({
    storyId: story.id, finalState: story.goldFinalState,
    revisions: story.revisions.map(({ id, changes, invalidCandidates }) => ({ revisionId: id, changes, invalidCandidates })),
  })),
  stateOpportunities,
  outlines: outlineCases.map(({ id, explicitFieldKeys, goldFields, shouldNotTrack, ambiguous }) => ({ id, explicitFieldKeys, goldFields, shouldNotTrack, ambiguous })),
};
const datasetHash = hash(dataset), goldHash = hash(gold);
const config = {
  benchmarkVersion: BENCHMARK_VERSION, status: "FROZEN_BEFORE_MODEL_RUN", frozenAt, datasetHash, goldHash,
  sourceBaselineSha: "6b26b385a84f4facd85a5f064fdc4f40b4f71604", benchmarkExecutionCodeSha: null,
  provider: "deepseek-api", requestedModel: "deepseek-flash", observedModel: null,
  endpoint: "https://api.deepseek.com/responses", temperature: 0, reasoning: "none", maxOutputTokens: 4000,
  developmentRuns: 0, stateHoldoutRuns: 3, blueprintHoldoutRuns: 2,
  arms: ["A1_DIRECT_LLM", "A2_RAG_DIRECT_LLM", "A3_STORYSTATE"],
  retrieval: { implementation: "evaluation-only deterministic lexical retrieval", productRagAvailable: false, maxChunks: 4 },
  expectedProviderCalls: {
    stateDirect: 42, stateRagDirect: 42, stateStoryStateExtractor: 42,
    stateStoryStateValidatorAssumingThreeCandidatesPerRevision: 126, blueprint: 36, total: 288,
  },
  hardProviderCallBudget: 300, retryPolicy: { maxRetriesPerCall: 1, transientOnly: true },
  realModelExecution: "NOT_EXECUTED_PROVIDER_CREDENTIAL_UNAVAILABLE",
  promptHashes: {
    direct: hash(directPrompt(stateSequences[0], stateSequences[0].revisions[0], stateSequences[0].initialState)),
    storyState: hash(storyStatePrompt(stateSequences[0], stateSequences[0].revisions[0], stateSequences[0].initialState, [])),
    blueprint: hash(blueprintPrompt(outlineCases[0])),
  },
};

const scale = stateScale(), oracle = oracleReplay(), rawOutline = rawOutlineMetrics();
const holdoutStories = stateSequences.filter(story => story.set === "holdout");
const stateRaw = [
  ...oracle.perStory.map(result => ({ benchmarkVersion: BENCHMARK_VERSION, resultType: "DETERMINISTIC_ORACLE_REPLAY", ...result })),
  ...["A1_DIRECT_LLM", "A2_RAG_DIRECT_LLM", "A3_STORYSTATE"].flatMap(arm => holdoutStories.flatMap(story => Array.from({ length: 3 }, (_, index) => ({
    benchmarkVersion: BENCHMARK_VERSION, resultType: "REAL_MODEL", arm, storyId: story.id, run: index + 1,
    status: "NOT_EXECUTED", reason: "PROVIDER_CREDENTIAL_UNAVAILABLE", providerCalls: 0,
  })))),
];
const holdoutOutlines = outlineCases.filter(item => item.set === "holdout");
function bootstrapOutlineCompleteness(iterations = 10000) {
  let seed = 22117;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const rates = Array.from({ length: iterations }, () => {
    const sample = Array.from({ length: holdoutOutlines.length }, () => holdoutOutlines[Math.floor(random() * holdoutOutlines.length)]);
    return sample.reduce((sum, item) => sum + item.explicitFieldKeys.length, 0) / sample.reduce((sum, item) => sum + item.goldFields.length, 0);
  }).sort((a, b) => a - b);
  return { method: "case-level percentile bootstrap", iterations, seed: 22117, lower: rates[Math.floor(iterations * 0.025)], upper: rates[Math.ceil(iterations * 0.975) - 1] };
}
const rawOutlineCi = bootstrapOutlineCompleteness();
const opportunityByCategory = Object.fromEntries([...new Set(stateOpportunities.map(item => item.category))].sort().map(category => {
  const rows = stateOpportunities.filter(item => item.category === category);
  return [category, { expectedChanges: rows.filter(item => item.expected === "change").length, expectedNoChange: rows.filter(item => item.expected === "no_change").length }];
}));
const traps = stateSequences.flatMap(story => story.revisions.flatMap(revision => revision.invalidCandidates.map(candidate => ({ storyId: story.id, revisionId: revision.id, ...candidate }))));
const trapInventory = Object.fromEntries([...new Set(traps.map(item => item.category))].sort().map(category => {
  const rows = traps.filter(item => item.category === category);
  return [category, { opportunities: rows.length, representativeCases: rows.slice(0, 2).map(item => `${item.storyId}/${item.revisionId}`) }];
}));
const blueprintRaw = [
  ...holdoutOutlines.map(item => ({ benchmarkVersion: BENCHMARK_VERSION, resultType: "RAW_OUTLINE_BASELINE", outlineId: item.id, quality: item.quality, numerator: item.explicitFieldKeys.length, denominator: item.goldFields.length, completeness: item.explicitFieldKeys.length / item.goldFields.length, requiredAddOperations: item.goldFields.length - item.explicitFieldKeys.length })),
  ...holdoutOutlines.flatMap(item => Array.from({ length: 2 }, (_, index) => ({ benchmarkVersion: BENCHMARK_VERSION, resultType: "AI_OPTIMIZED_BLUEPRINT", outlineId: item.id, run: index + 1, status: "NOT_EXECUTED", reason: "PROVIDER_CREDENTIAL_UNAVAILABLE", providerCalls: 0 }))),
];

const oracleTotals = oracle.perStory.reduce((sum, row) => ({ finalCorrect: sum.finalCorrect + row.finalCorrect, finalTotal: sum.finalTotal + row.finalTotal, changes: sum.changes + row.correctChanges, expectedChanges: sum.expectedChanges + row.expectedChanges, drift: sum.drift + row.drift, noChange: sum.noChange + row.noChange, invalidEscapes: sum.invalidEscapes + row.invalidEscapes, invalidOpportunities: sum.invalidOpportunities + row.invalidOpportunities }), { finalCorrect: 0, finalTotal: 0, changes: 0, expectedChanges: 0, drift: 0, noChange: 0, invalidEscapes: 0, invalidOpportunities: 0 });
const stateMetrics = {
  benchmarkVersion: BENCHMARK_VERSION, datasetHash, goldHash,
  realModel: Object.fromEntries(["A1_DIRECT_LLM", "A2_RAG_DIRECT_LLM", "A3_STORYSTATE"].map(arm => [arm, { status: "NOT_EXECUTED", finalStateAccuracy: null, transitionRecall: null, transitionPrecision: null, transitionF1: null, driftRate: null, invalidMutationEscapeRate: null, recoveryAccuracy: null, staleHistoryErrorRate: null, currentTruthAccuracy: null, fieldPreservationAccuracy: null, evidenceAccuracy: arm === "A3_STORYSTATE" ? null : "NOT_APPLICABLE", historicalEvidenceLeakageRate: arm === "A3_STORYSTATE" ? null : "NOT_APPLICABLE", consistency: null, errorRecoveryLag: null, reason: "PROVIDER_CREDENTIAL_UNAVAILABLE" }])),
  deterministicOracleReplay: {
    status: "SCORER_AND_STATE_REPLAY_VALIDATION_ONLY_NOT_MODEL_RESULT",
    finalStateAccuracy: { numerator: oracleTotals.finalCorrect, denominator: oracleTotals.finalTotal, rate: oracleTotals.finalCorrect / oracleTotals.finalTotal },
    transitionAccuracy: { numerator: oracleTotals.changes, denominator: oracleTotals.expectedChanges, rate: oracleTotals.changes / oracleTotals.expectedChanges },
    driftRate: { numerator: oracleTotals.drift, denominator: oracleTotals.noChange, rate: oracleTotals.drift / oracleTotals.noChange },
    invalidMutationEscapeRate: { numerator: oracleTotals.invalidEscapes, denominator: oracleTotals.invalidOpportunities, rate: oracleTotals.invalidEscapes / oracleTotals.invalidOpportunities },
    perStory: oracle.perStory, byCategory: opportunityByCategory,
  },
  existingSecondaryEvidence: { unsafeInterceptionRecall: { numerator: 15, denominator: 15, rate: 1 }, autoHandledPrecision: { numerator: 4, denominator: 4, rate: 1 }, humanReviewLoadReduction: { numerator: 4, denominator: 20, rate: 0.2 }, reviewPrecision: { numerator: 15, denominator: 16, rate: 0.9375 }, falseAutoRate: { numerator: 0, denominator: 15, rate: 0 }, invalidMutationEscape: { numerator: 0, denominator: 46, rate: 0 }, deterministicSequentialTransitions: { numerator: 67, denominator: 67, rate: 1 } },
};
const blueprintMetrics = {
  benchmarkVersion: BENCHMARK_VERSION, datasetHash, goldHash,
  rawOutline: { status: "EXECUTED_DETERMINISTIC_GOLD_MAPPING", ...rawOutline, confidenceInterval95: rawOutlineCi },
  aiOptimizedBlueprint: { status: "NOT_EXECUTED", completeness: null, precision: null, recall: null, f1: null, exactFieldAccuracy: null, criticalFieldRecall: null, unsupportedAdditionRate: null, duplicateRate: null, wrongTypeRate: null, humanEdits: null, humanRevisionReduction: null, acceptedAsIsRate: null, interventionRate: null, reason: "PROVIDER_CREDENTIAL_UNAVAILABLE" },
};

writeJson("DATASET_MANIFEST.json", { ...dataset, datasetHash });
writeJson("GOLD_MANIFEST.json", { ...gold, goldHash });
writeJson("RUN_CONFIG.json", config);
writeJsonl("STATE_SYNC_RAW_RESULTS.jsonl", stateRaw);
writeJson("STATE_SYNC_METRICS.json", stateMetrics);
writeJsonl("BLUEPRINT_RAW_RESULTS.jsonl", blueprintRaw);
writeJson("BLUEPRINT_METRICS.json", blueprintMetrics);
writeJson("COST_LATENCY_METRICS.json", {
  status: "REAL_MODEL_NOT_EXECUTED", providerCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0,
  latencyMs: { mean: null, median: null, p95: null }, providerFailures: 0, retries: 0, estimatedCost: null,
  costReason: "No credential was available; explicit extraction/blueprint pricing was not frozen.", plannedCallBudget: config.expectedProviderCalls,
});

writeText("README.md", `# StoryState Resume Benchmark\n\nStatus: **COMPLETE_WITH_PROVIDER_LIMITATION**\n\nThis directory freezes an internal synthetic benchmark for long-horizon state sync and outline-to-blueprint evaluation. Dataset, human-authored Gold, metric definitions, prompts, and run configuration were frozen before execution. No production code was changed.\n\nReal model arms are marked \`NOT_EXECUTED\` because no authorized local provider credential was available. Deterministic oracle replay validates the scorer and sequential-state ledger only; it is not presented as model performance.\n\nDataset hash: \`${datasetHash}\`\n\nGold hash: \`${goldHash}\`\n`);

writeText("BENCHMARK_DESIGN.md", `# Benchmark Design\n\n## A — Sequential Long-Horizon State Sync\n\nThree independent internal synthetic story sequences contain ${scale.revisions} ordered Source Revisions. Every revision consumes the previous state. The frozen ledger contains ${scale.expectedChanges} expected changes, ${scale.expectedNoChange} expected-no-change opportunities, and ${scale.invalidOpportunities} invalid-mutation challenges. One sequence is Development and two are frozen Holdout.\n\nThe three preregistered real-model arms are A1 Direct LLM, A2 evaluation-only lexical RAG + Direct LLM, and A3 StoryState incremental extraction + compiler + validator + Gold-based human decision simulation + commit. Product RAG does not exist at this baseline, so A2/A3 retrieval is explicitly evaluation-only and may not be described as shipped architecture.\n\n## B — Outline to Tracking Blueprint\n\nTwenty-four human-authored synthetic outlines are balanced across sparse, medium, and detailed quality. Six are Development and eighteen Holdout. Each outline has eight Gold fields, criticality, rationale, should-not-track fields, and an ambiguity requiring human calibration.\n\nB0 maps only information explicitly present in the raw outline. B1 requires a real model and was not executed.\n\n## Freeze and leakage controls\n\nDataset and Gold are separate artifacts. Prompts serialize only dataset inputs, prior state, current revision, and retrieved source text. They do not serialize Gold changes, final state, invalid-candidate labels, or expected field mappings. Any future design correction requires a version bump and full rerun of every affected arm.\n\n## Statistics\n\nAll metrics require numerator, denominator, percentage, by-story/category/quality/run breakdown, and paired deltas. Bootstrap intervals are produced only for executed model results. Missing model results remain null rather than inheriting deterministic-oracle values.\n`);

writeText("STATE_SYNC_BADCASES.md", `# State Sync Badcases\n\n## Real-model badcases\n\n**NOT EXECUTED — provider credential unavailable.** No model output exists to classify.\n\n## Frozen challenge inventory\n\nThe ${scale.invalidOpportunities} invalid opportunities rotate through wrong owner, holder/owner confusion, stale history, belief/world-truth confusion, unsupported inference, incorrect entity, conflict, and stale-before. Deterministic oracle replay escaped 0/${scale.invalidOpportunities}; this validates the scorer and rejection simulation only.\n\n| Category | Opportunities | Representative cases |\n| --- | ---: | --- |\n${Object.entries(trapInventory).map(([category, value]) => `| ${category} | ${value.opportunities} | ${value.representativeCases.join(", ")} |`).join("\n")}\n`);

writeText("BLUEPRINT_BADCASES.md", `# Blueprint Badcases\n\n## AI Blueprint badcases\n\n**NOT EXECUTED — provider credential unavailable.** Missed entity, missed field, wrong type, unsupported addition, duplicate field, over-inference, under-specification, and human-needed ambiguity rates are therefore MISSING.\n\n## Dataset challenge inventory\n\nEvery outline includes two should-not-track decorative attributes and one ambiguity requiring human calibration: 48 unsupported-addition traps and 24 human-decision opportunities overall. Representative cases: \`outline-01\` (sparse) and \`outline-24\` (detailed). These are frozen Gold labels, not observed AI errors.\n`);

const missing = "NOT_EXECUTED";
writeText("RESUME_METRICS_MASTER.md", `# Resume Metrics Master\n\n| Metric | Definition | Numerator | Denominator | Result | Baseline | StoryState Result | Absolute Δ | Relative Δ | 95% CI | Evidence File | Resume Eligible | Limitation |\n| --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| Direct Final State Accuracy | Correct final fields / Gold final fields | — | — | ${missing} | — | — | — | — | — | STATE_SYNC_RAW_RESULTS.jsonl | NO | Provider credential unavailable |\n| RAG Direct Final State Accuracy | Correct final fields / Gold final fields | — | — | ${missing} | Direct | — | — | — | — | STATE_SYNC_RAW_RESULTS.jsonl | NO | Product RAG is not implemented; evaluation arm not run |\n| StoryState Final State Accuracy | Correct final fields / Gold final fields | — | — | ${missing} | Direct/RAG | — | — | — | — | STATE_SYNC_RAW_RESULTS.jsonl | NO | Real Extractor/Validator arm not run |\n| Direct Drift Rate | Incorrect no-evidence changes / no-change opportunities | — | — | ${missing} | — | — | — | — | — | STATE_SYNC_RAW_RESULTS.jsonl | NO | Provider credential unavailable |\n| StoryState Drift Rate | Incorrect no-evidence changes / no-change opportunities | — | — | ${missing} | Direct | — | — | — | — | STATE_SYNC_RAW_RESULTS.jsonl | NO | Deterministic oracle 0/${scale.expectedNoChange} is not a model result |\n| Deterministic oracle transition conformance | Correct applied Gold changes / frozen changes | ${oracleTotals.changes} | ${oracleTotals.expectedChanges} | 100% | — | 100% | — | — | not applicable | STATE_SYNC_METRICS.json | NO | Scorer/replay validation, not model performance |\n| Existing unsafe interception recall | Unsafe routed to human / Gold unsafe | 15 | 15 | 100% | all-manual | 100% | — | — | directional | ../stage-2.2.1b/metrics.json | YES | Existing 20-case synthetic Holdout |\n| Existing review-load reduction | Reviews avoided / all cases | 4 | 20 | 20% | 0% automation | 20% | +20 pp | — | directional | ../stage-2.2.1b/metrics.json | YES | Existing 20-case synthetic Holdout |\n| Existing invalid mutation escape | Escaped invalid candidates / challenges | 0 | 46 | 0% | — | 0% | — | — | not applicable | ../RESUME_METRICS_AUDIT.md | YES | Deterministic challenge set |\n| Raw Outline Completeness | Explicit Gold fields in raw outline / Gold fields | ${rawOutline.numerator} | ${rawOutline.denominator} | ${(rawOutline.rate * 100).toFixed(1)}% | raw outline | — | — | — | directional | BLUEPRINT_METRICS.json | YES as baseline only | Human mapping of synthetic Holdout |\n| AI Blueprint Completeness | Matched Gold fields / Gold fields | — | — | ${missing} | ${(rawOutline.rate * 100).toFixed(1)}% | — | — | — | — | BLUEPRINT_RAW_RESULTS.jsonl | NO | Provider credential unavailable |\n| Human Revision Reduction | (raw edits - AI edits) / raw edits | — | — | ${missing} | ${rawOutline.humanAddOperations} raw ADD operations | — | — | — | — | BLUEPRINT_RAW_RESULTS.jsonl | NO | AI arm not run |\n`);

writeText("RESUME_READY_CLAIMS.md", `# Resume-ready Claims\n\n## POINT 1 — Long-horizon State Sync\n\nThe new three-arm real-model result is **NOT EXECUTED** and is not resume eligible. Existing secondary evidence remains valid:\n\n- routed 15/15 Gold-unsafe cases to human review while avoiding 4/20 reviews;\n- blocked 46/46 invalid mutation challenges from entering Canonical State;\n- applied 67/67 hand-authored Gold field transitions across five sequential chapters.\n\nResume-ready STAR sentence: **Designed a governed human-in-the-loop state pipeline for long-form AIGC that routed 15/15 unsafe semantic cases to review, reduced review load by 20% on a frozen 20-case internal Holdout, and blocked 46/46 invalid mutation challenges from entering versioned Canonical State.**\n\n## POINT 2 — Outline Optimization\n\nThe frozen Holdout raw-outline baseline is ${rawOutline.numerator}/${rawOutline.denominator} = ${(rawOutline.rate * 100).toFixed(1)}% complete and requires ${rawOutline.humanAddOperations} ADD operations to reach Gold. The AI Blueprint arm is **NOT EXECUTED**, so no improvement, precision, critical recall, unsupported-addition, or revision-reduction claim is resume eligible.\n\nResume-ready STAR sentence: **MISSING — a truthful AI optimization result cannot be written without a real model run.**\n`);

writeText("INTERVIEW_EVIDENCE.md", `# Interview Evidence\n\n| Question | Evidence-backed answer | Source |\n| --- | --- | --- |\n| Why not ordinary RAG? | Existing product evidence validates governance and human routing; no RAG attribution experiment was executed. | STATE_SYNC_METRICS.json |\n| How much did RAG add? | MISSING. A2 was frozen but not executed, and product RAG is not implemented. | RUN_CONFIG.json |\n| How much did state governance add? | MISSING for real models. Deterministic replay must not substitute for A3. | STATE_SYNC_METRICS.json |\n| Why incremental state? | It preserves a versioned current truth and gates field-level changes instead of regenerating the whole state; existing evidence applied 67/67 Gold transitions and blocked 46/46 invalid challenges. | ../RESUME_METRICS_AUDIT.md |\n| Does performance decay with story length? | MISSING for models. The benchmark freezes revision-level curves, but no model run exists. | STATE_SYNC_RAW_RESULTS.jsonl |\n| Which fields are hardest? | MISSING for the new benchmark. Existing Holdout had evidence/knowledge/temporal boundaries but is too small for a universal ranking. | ../stage-2.2.1b/metrics.json |\n| How are errors stopped? | Deterministic compiler/gates, conservative validator routing, human Decision, and controlled commit; only committed state counts as an escape. | ../RESUME_METRICS_AUDIT.md |\n| How incomplete are user outlines? | Frozen Holdout raw outlines cover ${rawOutline.numerator}/${rawOutline.denominator} = ${(rawOutline.rate * 100).toFixed(1)}% of Gold fields. Sparse/medium/detailed breakdown is in BLUEPRINT_METRICS.json. | BLUEPRINT_METRICS.json |\n| What does AI add or over-add? | MISSING because B1 was not executed. | BLUEPRINT_RAW_RESULTS.jsonl |\n| How much human editing remains? | Raw baseline needs ${rawOutline.humanAddOperations} ADD operations; post-AI edits are MISSING. This is an edit-count proxy, not time saved. | BLUEPRINT_METRICS.json |\n| What is cost and latency? | New benchmark: 0 calls and no model results. Planned bounded budget is 288 expected calls / 300 hard cap. Existing semantic experiment usage remains separate. | COST_LATENCY_METRICS.json |\n| Why retain human review? | Existing live Holdout routed all 15 unsafe cases to humans while safely auto-handling 4 cases. | ../stage-2.2.1b/metrics.json |\n| What should real users validate next? | Production prevalence, reviewer time, real-outline quality, and paired A1/A2/A3 performance. | BENCHMARK_DESIGN.md |\n`);

console.log(JSON.stringify({ status: "COMPLETE_WITH_PROVIDER_LIMITATION", datasetHash, goldHash, stateScale: scale, outlines: outlineCases.length, holdoutOutlines: holdoutOutlines.length, rawOutline, providerCalls: 0 }, null, 2));
