import { datasetHash, type CaseResult, type EvaluationRun, type ModelIdentity } from "./runner";
import { deepFreeze, digest, type BoundCase, type Group } from "./contract";

export type Pricing = ModelIdentity & { currency: string; inputPerMillion: number; outputPerMillion: number };
const fraction = (count: number, total: number) => ({ count, total, rate: total ? count / total : null });
function timing(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return {
    mean: n ? sorted.reduce((a, b) => a + b, 0) / n : null,
    median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null,
    p95: n >= 20 ? sorted[Math.ceil(n * 0.95) - 1] : null,
    p95Note: n >= 20 ? "Empirical nearest-rank only; not statistical significance." : "Unavailable: fewer than 20 observations.",
  };
}
function consumption(results: CaseResult[], pricing?: Pricing) {
  const calls = results.flatMap(r => r.calls), available = calls.length > 0 && calls.every(c => c.usage !== null);
  const inputTokens = available ? calls.reduce((sum, c) => sum + c.usage!.inputTokens, 0) : null;
  const outputTokens = available ? calls.reduce((sum, c) => sum + c.usage!.outputTokens, 0) : null;
  return {
    modelCalls: calls.length, usageAvailable: available,
    inputTokens, outputTokens,
    estimatedCost: available && pricing ? (inputTokens! * pricing.inputPerMillion + outputTokens! * pricing.outputPerMillion) / 1e6 : null,
    currency: available && pricing ? pricing.currency : null,
    costStatus: !available ? "unavailable: provider usage incomplete" : !pricing ? "unavailable: explicit pricing absent" : "estimate from supplied pricing and usage",
  };
}
function validResult(result: CaseResult) {
  return result.eligible && result.calls.length > 0 && result.calls.every(c => c.error === null);
}
export function calculateMetrics(cases: readonly BoundCase[], run: EvaluationRun, pricing?: Pricing) {
  if (datasetHash(cases) !== run.datasetHash) throw new Error("REPORT_DATASET_MISMATCH");
  if (pricing && (digest({ provider: pricing.provider, modelId: pricing.modelId, modelVersion: pricing.modelVersion }) !== digest(run.identity) ||
    !pricing.currency || ![pricing.inputPerMillion, pricing.outputPerMillion].every(n => Number.isFinite(n) && n >= 0)))
    throw new Error("INVALID_PRICING_CONFIG");
  const metadata = new Map(cases.map(c => [c.metadata.caseId, c.metadata]));
  const seen = new Set<string>();
  for (const result of run.results) {
    if (!metadata.has(result.caseId)) throw new Error("UNKNOWN_RESULT_CASE");
    const key = `${result.caseId}/${result.architecture}/${result.phase}/${result.run}`;
    if (seen.has(key)) throw new Error("DUPLICATE_RESULT");
    seen.add(key);
    if (!Number.isFinite(result.latencyMs) || result.latencyMs < 0 || result.modelCalls !== result.calls.length) throw new Error("INVALID_RESULT_MEASUREMENT");
    if (result.calls.some(c => c.usage && ![c.usage.inputTokens, c.usage.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0)))
      throw new Error("INVALID_USAGE_MEASUREMENT");
    if (result.phase === "primary" ? result.run !== 0 : ![1, 2, 3].includes(result.run) || !metadata.get(result.caseId)!.stabilitySelected)
      throw new Error("INVALID_RESULT_PHASE");
  }
  function summarize(set: "anchor" | "holdout", architecture: "generic" | "specialist") {
    const expected = cases.filter(c => c.metadata.set === set);
    const results = run.results.filter(r => r.phase === "primary" && r.architecture === architecture && metadata.get(r.caseId)!.set === set);
    if (results.length !== expected.length) throw new Error("INCOMPLETE_PRIMARY_RESULTS");
    const eligible = results.filter(r => r.eligible);
    const correct = (r: CaseResult) => validResult(r) && r.semanticVerdict === metadata.get(r.caseId)!.goldSemanticVerdict;
    const goldAuto = eligible.filter(r => metadata.get(r.caseId)!.goldFinalRouting === "AUTO_ACCEPT_ELIGIBLE");
    const goldNonAuto = eligible.filter(r => metadata.get(r.caseId)!.goldFinalRouting !== "AUTO_ACCEPT_ELIGIBLE");
    const falseAuto = goldNonAuto.filter(r => r.finalRouting === "AUTO_ACCEPT_ELIGIBLE").length;
    const perGroup = Object.fromEntries((["control", "evidence", "knowledge", "temporal"] as Group[]).map(group => {
      const groupResults = eligible.filter(r => metadata.get(r.caseId)!.group === group);
      return [group, fraction(groupResults.filter(correct).length, groupResults.length)];
    }));
    return {
      cases: results.length, eligible: eligible.length, ineligible: results.length - eligible.length,
      semanticAccuracy: fraction(eligible.filter(correct).length, eligible.length),
      invalidOrUnavailableResponses: eligible.filter(r => !validResult(r)).length,
      falseAutoAccept: fraction(falseAuto, goldNonAuto.length),
      falseAutoAcceptOverAll: fraction(falseAuto, eligible.length),
      safeAutoCoverage: fraction(goldAuto.filter(r => r.finalRouting === "AUTO_ACCEPT_ELIGIBLE").length, goldAuto.length),
      reviewRate: fraction(eligible.filter(r => r.finalRouting === "NEEDS_REVIEW").length, eligible.length),
      perGroup, averageModelCalls: results.length ? results.reduce((sum, r) => sum + r.modelCalls, 0) / results.length : null,
      latencyMs: timing(results.map(r => r.latencyMs)),
      perCase: results.map(r => ({ caseId: r.caseId, semanticVerdict: r.semanticVerdict, finalRouting: r.finalRouting, modelCalls: r.modelCalls, latencyMs: r.latencyMs })),
      consumption: consumption(results, pricing),
    };
  }
  function stability(architecture: "generic" | "specialist") {
    const selected = cases.filter(c => c.metadata.set === "holdout" && c.metadata.stabilitySelected);
    const details = selected.map(c => {
      const results = run.results.filter(r => r.phase === "stability" && r.architecture === architecture && r.caseId === c.metadata.caseId);
      const complete = results.length === 3, valid = complete && results.every(validResult);
      return { caseId: c.metadata.caseId, complete, valid, stable: valid && new Set(results.map(r => r.semanticVerdict)).size === 1, verdicts: results.map(r => r.semanticVerdict) };
    });
    const complete = details.length > 0 && details.every(d => d.complete);
    return { complete, exactAgreement: complete ? fraction(details.filter(d => d.stable).length, details.length) : null, details };
  }
  const anchor = { generic: summarize("anchor", "generic"), specialist: summarize("anchor", "specialist") };
  const holdout = { generic: summarize("holdout", "generic"), specialist: summarize("holdout", "specialist") };
  return deepFreeze({
    label: run.label, identity: run.identity, datasetHash: run.datasetHash, evaluationConfigHash: run.evaluationConfigHash, frozenCommit: run.frozenCommit,
    anchor, holdout, stability: { generic: stability("generic"), specialist: stability("specialist") },
    allRunsConsumption: consumption(run.results, pricing),
    architectureEvidence: {
      primarySet: "holdout", sampleSize: holdout.generic.eligible,
      specialistMinusGenericCorrectCases: holdout.specialist.semanticAccuracy.count - holdout.generic.semanticAccuracy.count,
      specialistMinusGenericFalseAuto: holdout.specialist.falseAutoAccept.count - holdout.generic.falseAutoAccept.count,
      decision: "PRODUCT_OWNER_REQUIRED",
      interpretation: run.label === "HARNESS TEST ONLY"
        ? "Mock results test the harness only. No model-performance or architecture conclusion."
        : "Inspect Holdout safety, boundary error pairs, stability and extra calls/latency/cost. One case out of 20 is not automatically meaningful.",
      validOutcomes: ["Retain specialists only for safety-preserving, interpretable gains worth their cost.", "Prefer simpler Generic if effectively equivalent.", "Simplify to Generic if Generic performs better."],
    },
  });
}
export function renderReport(metrics: ReturnType<typeof calculateMetrics>): string {
  const lines = [`# ${metrics.label}`, "", `Dataset: ${metrics.datasetHash}`, `Model: ${metrics.identity.provider} / ${metrics.identity.modelId} / ${metrics.identity.modelVersion}`, "",
    "Anchor is sanity/regression only. Holdout is the primary architecture evidence.", "",
    "| Set | Architecture | Semantic Correct | False AUTO | Safe AUTO | Review | Mean Calls | Mean Latency (ms) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |"];
  for (const set of ["anchor", "holdout"] as const) for (const architecture of ["generic", "specialist"] as const) {
    const m = metrics[set][architecture], ratio = (r: { count: number; total: number }) => `${r.count}/${r.total}`;
    lines.push(`| ${set} | ${architecture} | ${ratio(m.semanticAccuracy)} | ${ratio(m.falseAutoAccept)} | ${ratio(m.safeAutoCoverage)} | ${ratio(m.reviewRate)} | ${m.averageModelCalls} | ${m.latencyMs.mean} |`);
  }
  lines.push("", metrics.architectureEvidence.interpretation, `Cost: ${metrics.allRunsConsumption.estimatedCost ?? "unavailable"} ${metrics.allRunsConsumption.currency ?? ""}`,
    "", "Structured report (includes per-case/group latency, usage and stability):", "", "```json", JSON.stringify(metrics, null, 2), "```");
  return lines.join("\n");
}
