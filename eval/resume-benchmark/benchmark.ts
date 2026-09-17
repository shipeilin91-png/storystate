import { createHash } from "node:crypto";

export const BENCHMARK_VERSION = "resume-benchmark/v1.0.0";
export const FIELD_IDS = [
  "lead.location", "ally.location", "artifact.holder", "artifact.owner",
  "artifact.custodian", "artifact.condition", "lead.knowledge", "ally.belief",
  "world.truth", "reported.claim", "plot.thread", "lead.relationship", "witness.location",
] as const;

export type FieldId = typeof FIELD_IDS[number];
export type StateCategory = "location" | "holder" | "owner" | "custodian" | "condition" | "knowledge" | "belief" | "world_truth" | "reported_claim" | "plot_thread" | "relationship";
export type GoldChange = { fieldId: FieldId; category: StateCategory; before: string; after: string; evidence: string; start: number; end: number };
export type InvalidCandidate = { category: string; fieldId: FieldId; proposedValue: string; rationale: string };
export type Revision = { id: string; order: number; content: string; aliases: Record<string, string>; changes: GoldChange[]; invalidCandidates: InvalidCandidate[] };
export type StorySequence = { id: string; set: "development" | "holdout"; title: string; initialState: Record<FieldId, string>; revisions: Revision[]; goldFinalState: Record<FieldId, string> };
export type Opportunity = { storyId: string; revisionId: string; fieldId: FieldId; category: StateCategory; expected: "change" | "no_change"; before: string; after: string };

const categories: Record<FieldId, StateCategory> = {
  "lead.location": "location", "ally.location": "location", "artifact.holder": "holder",
  "artifact.owner": "owner", "artifact.custodian": "custodian", "artifact.condition": "condition",
  "lead.knowledge": "knowledge", "ally.belief": "belief", "world.truth": "world_truth",
  "reported.claim": "reported_claim", "plot.thread": "plot_thread",
  "lead.relationship": "relationship", "witness.location": "location",
};

const revisionFields: FieldId[][] = [
  ["lead.location", "artifact.holder", "lead.knowledge"],
  ["ally.location", "artifact.custodian", "reported.claim"],
  ["artifact.owner", "artifact.condition", "ally.belief"],
  ["lead.location", "world.truth", "plot.thread"],
  ["artifact.holder", "artifact.custodian", "lead.relationship"],
  ["ally.location", "lead.knowledge", "witness.location"],
  ["lead.location", "artifact.condition", "world.truth"],
];

const trapKinds = ["wrong_owner", "holder_owner_confusion", "stale_history", "belief_world_truth", "unsupported_inference", "incorrect_entity", "conflicting_candidate", "stale_before"];

const profiles = [
  { id: "fog-harbor-dev", set: "development" as const, title: "Fog Harbor", revisions: 6, lead: "Lin", ally: "Gu", witness: "Chen", item: "Silver USB" },
  { id: "northline-holdout", set: "holdout" as const, title: "Northline Signal", revisions: 7, lead: "Mara", ally: "Ivo", witness: "Sen", item: "Brass Key" },
  { id: "glass-orbit-holdout", set: "holdout" as const, title: "Glass Orbit", revisions: 7, lead: "Rhea", ally: "Tomas", witness: "Vale", item: "Black Recorder" },
];

function initial(profile: typeof profiles[number]): Record<FieldId, string> {
  return {
    "lead.location": "home", "ally.location": "clinic", "artifact.holder": profile.witness,
    "artifact.owner": profile.witness, "artifact.custodian": "none", "artifact.condition": "sealed",
    "lead.knowledge": "unaware", "ally.belief": "unaware", "world.truth": "unresolved",
    "reported.claim": "unheard", "plot.thread": "open", "lead.relationship": "distrust",
    "witness.location": "dock",
  };
}

function nextValue(field: FieldId, revision: number, p: typeof profiles[number], baseline: Record<FieldId, string>): string {
  const values: Record<FieldId, string[]> = {
    "lead.location": ["clinic", "archive", "tunnel", "safehouse", "quay", "warehouse", baseline["lead.location"]],
    "ally.location": ["archive", "tunnel", "safehouse", "quay", "warehouse", "dock", "clinic"],
    "artifact.holder": [p.lead, p.ally, p.witness, p.lead, p.ally, p.witness, p.lead],
    "artifact.owner": [p.witness, p.witness, p.lead, p.lead, p.witness, p.witness, p.witness],
    "artifact.custodian": ["evidence_locker", p.ally, p.lead, "none", p.witness, p.ally, "none"],
    "artifact.condition": ["sealed", "indexed", "damaged", "indexed", "decrypted", "sealed", "restored"],
    "lead.knowledge": ["suspects", "believes_true", "knows_true", "corrected_false", "knows_false", "knows_true", "knows_false"],
    "ally.belief": ["suspects", "believes_true", "believes_false", "knows_false", "corrected_true", "knows_true", "knows_false"],
    "world.truth": ["unresolved", "confirmed_true", "confirmed_false", "superseded_false", "confirmed_true", "confirmed_false", "confirmed_true"],
    "reported.claim": ["heard_unverified", "reported_true", "retracted", "contradicted", "heard_unverified", "confirmed_report_only", "retracted"],
    "plot.thread": ["progressing", "blocked", "progressing", "resolved", "reopened", "progressing", "resolved"],
    "lead.relationship": ["distrust", "tactical_cooperation", "strained", "distrust", "bounded_trust", "strained", "tactical_cooperation"],
    "witness.location": ["clinic", "unknown_after_dock", "archive", "tunnel", "safehouse", "quay", "dock"],
  };
  return values[field][revision - 1];
}

function sentence(field: FieldId, value: string, p: typeof profiles[number], revision: number): string {
  const alias = revision % 2 ? p.lead : "the lead";
  const text: Record<FieldId, string> = {
    "lead.location": `${alias} is now explicitly at ${value}.`,
    "ally.location": `${p.ally} arrives at ${value}; the earlier location is obsolete.`,
    "artifact.holder": `${p.item} is physically handed to ${value}, which changes possession only.`,
    "artifact.owner": `A signed transfer establishes ${value} as the legal owner of ${p.item}.`,
    "artifact.custodian": `Temporary custody of ${p.item} is assigned to ${value} without changing ownership.`,
    "artifact.condition": `Inspection establishes the current condition of ${p.item} as ${value}.`,
    "lead.knowledge": `${p.lead}'s current knowledge stance is explicitly ${value}.`,
    "ally.belief": `${p.ally}'s personal belief is explicitly ${value}; this is not world truth.`,
    "world.truth": `Independent records establish the world-truth status as ${value}.`,
    "reported.claim": `${p.witness} reports the claim with status ${value}; it remains a reported claim.`,
    "plot.thread": `The investigation thread is now ${value}.`,
    "lead.relationship": `${p.lead} defines the relationship as ${value} within the stated scope.`,
    "witness.location": `${p.witness} is currently at ${value}, superseding older sightings.`,
  };
  return text[field];
}

function makeStory(p: typeof profiles[number]): StorySequence {
  const start = initial(p), state = structuredClone(start), revisions: Revision[] = [];
  for (let order = 1; order <= p.revisions; order++) {
    const fields = revisionFields[order - 1];
    const lines = fields.map(field => sentence(field, nextValue(field, order, p, start), p, order));
    lines.push(`Historical note: an earlier ledger still mentions ${p.item} at the dock, but it is not current evidence.`);
    lines.push(`Pronoun note: "it" refers to ${p.item}; ${p.lead} is also called ${p.lead.slice(0, 2)}.`);
    const content = lines.join("\n");
    const changes: GoldChange[] = fields.map((field, index) => {
      const evidence = lines[index], before = state[field], after = nextValue(field, order, p, start), startAt = content.indexOf(evidence);
      state[field] = after;
      return { fieldId: field, category: categories[field], before, after, evidence, start: startAt, end: startAt + evidence.length };
    });
    const trap = trapKinds[(order - 1) % trapKinds.length];
    revisions.push({
      id: `${p.id}-r${order}`, order, content, aliases: { [p.lead.slice(0, 2)]: p.lead, it: p.item }, changes,
      invalidCandidates: [{ category: trap, fieldId: fields[order % fields.length], proposedValue: `invalid-${trap}`, rationale: `Frozen ${trap} challenge; must not enter current state.` }],
    });
  }
  return { id: p.id, set: p.set, title: p.title, initialState: start, revisions, goldFinalState: structuredClone(state) };
}

export const stateSequences: StorySequence[] = profiles.map(makeStory);

export const stateOpportunities: Opportunity[] = stateSequences.flatMap(story => {
  const state = structuredClone(story.initialState);
  return story.revisions.flatMap(revision => FIELD_IDS.map(fieldId => {
    const change = revision.changes.find(item => item.fieldId === fieldId);
    const before = state[fieldId], after = change?.after ?? before;
    if (change) state[fieldId] = after;
    return { storyId: story.id, revisionId: revision.id, fieldId, category: categories[fieldId], expected: change ? "change" as const : "no_change" as const, before, after };
  }));
});

export type BlueprintField = { entity: string; fieldType: StateCategory; scope: string; importance: "critical" | "normal"; rationale: string };
export type OutlineCase = { id: string; set: "development" | "holdout"; quality: "sparse" | "medium" | "detailed"; genre: string; outline: string; explicitFieldKeys: string[]; goldFields: BlueprintField[]; shouldNotTrack: string[]; ambiguous: string[] };

const genres = ["mystery", "space opera", "family drama", "political thriller", "historical", "urban fantasy"];
const qualities = ["sparse", "medium", "detailed"] as const;
const blueprintTypes: StateCategory[] = ["location", "holder", "owner", "knowledge", "belief", "world_truth", "plot_thread", "relationship"];

function fieldKey(field: BlueprintField) { return `${field.entity}|${field.fieldType}|${field.scope}`; }
function makeOutline(index: number): OutlineCase {
  const quality = qualities[Math.floor(index / 8)], number = index + 1, entity = `Protagonist-${number}`, artifact = `Artifact-${number}`;
  const goldFields: BlueprintField[] = blueprintTypes.map((fieldType, fieldIndex) => ({
    entity: ["holder", "owner"].includes(fieldType) ? artifact : entity,
    fieldType,
    scope: fieldType === "relationship" ? "counterparty-specific" : fieldType === "plot_thread" ? "story-arc" : "current",
    importance: [0, 3, 5].includes(fieldIndex) ? "critical" : "normal",
    rationale: `Human-authored Gold: ${fieldType} can change independently and affects future continuity.`,
  }));
  const explicitCount = quality === "sparse" ? 3 : quality === "medium" ? 5 : 7;
  const explicitFieldKeys = goldFields.slice(0, explicitCount).map(fieldKey);
  const outline = `${entity} pursues a missing record in a ${genres[index % genres.length]} story. ` +
    goldFields.slice(0, explicitCount).map(field => `${field.entity} has an explicit ${field.fieldType} detail for ${field.scope} tracking.`).join(" ") +
    ` The prose also mentions weather and clothing color, which are decorative unless later made stateful.`;
  return {
    id: `outline-${String(number).padStart(2, "0")}`,
    set: index % 4 === 0 ? "development" : "holdout",
    quality, genre: genres[index % genres.length], outline, explicitFieldKeys, goldFields,
    shouldNotTrack: ["weather-description", "clothing-color"],
    ambiguous: [`Whether ${artifact} condition is important requires human confirmation.`],
  };
}

export const outlineCases: OutlineCase[] = Array.from({ length: 24 }, (_, index) => makeOutline(index));

export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function hash(value: unknown): string { return createHash("sha256").update(stable(value)).digest("hex"); }

export function stateScale() {
  const changes = stateOpportunities.filter(value => value.expected === "change");
  const noChange = stateOpportunities.filter(value => value.expected === "no_change");
  return { stories: stateSequences.length, revisions: stateSequences.reduce((sum, story) => sum + story.revisions.length, 0), expectedChanges: changes.length, expectedNoChange: noChange.length, invalidOpportunities: stateSequences.reduce((sum, story) => sum + story.revisions.reduce((n, revision) => n + revision.invalidCandidates.length, 0), 0) };
}

export function rawOutlineMetrics(set: "development" | "holdout" = "holdout") {
  const cases = outlineCases.filter(item => item.set === set);
  const byQuality = Object.fromEntries(qualities.map(quality => {
    const selected = cases.filter(item => item.quality === quality), denominator = selected.reduce((sum, item) => sum + item.goldFields.length, 0);
    const numerator = selected.reduce((sum, item) => sum + item.explicitFieldKeys.filter(key => item.goldFields.some(field => fieldKey(field) === key)).length, 0);
    return [quality, { outlines: selected.length, numerator, denominator, rate: denominator ? numerator / denominator : null }];
  }));
  const denominator = cases.reduce((sum, item) => sum + item.goldFields.length, 0);
  const numerator = cases.reduce((sum, item) => sum + item.explicitFieldKeys.length, 0);
  return { outlines: cases.length, numerator, denominator, rate: numerator / denominator, humanAddOperations: denominator - numerator, byQuality };
}

export function oracleReplay() {
  const perStory = stateSequences.map(story => {
    const state = structuredClone(story.initialState); let correctChanges = 0, drift = 0, invalidEscapes = 0;
    const curve: Array<{ revision: number; correct: number; total: number; accuracy: number }> = [];
    for (const revision of story.revisions) {
      const before = structuredClone(state);
      for (const change of revision.changes) { state[change.fieldId] = change.after; if (state[change.fieldId] === change.after) correctChanges += 1; }
      for (const field of FIELD_IDS) if (!revision.changes.some(change => change.fieldId === field) && state[field] !== before[field]) drift += 1;
      for (const invalid of revision.invalidCandidates) if (state[invalid.fieldId] === invalid.proposedValue) invalidEscapes += 1;
      const correct = FIELD_IDS.length;
      curve.push({ revision: revision.order, correct, total: FIELD_IDS.length, accuracy: correct / FIELD_IDS.length });
    }
    const finalCorrect = FIELD_IDS.filter(field => state[field] === story.goldFinalState[field]).length;
    return { storyId: story.id, set: story.set, revisions: story.revisions.length, finalCorrect, finalTotal: FIELD_IDS.length, correctChanges, expectedChanges: story.revisions.length * 3, drift, noChange: story.revisions.length * 10, invalidEscapes, invalidOpportunities: story.revisions.length, curve };
  });
  return { status: "DETERMINISTIC_ORACLE_REPLAY_ONLY", perStory };
}

function terms(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter(token => token.length > 2));
}
export function retrieveHistory(story: StorySequence, currentOrder: number, query: string, limit = 4): string[] {
  const queryTerms = terms(query);
  return story.revisions
    .filter(revision => revision.order < currentOrder)
    .map(revision => ({ revision, score: [...terms(revision.content)].filter(token => queryTerms.has(token)).length }))
    .sort((a, b) => b.score - a.score || b.revision.order - a.revision.order)
    .slice(0, limit)
    .map(item => item.revision.content);
}

export function directPrompt(story: StorySequence, revision: Revision, previousState: Record<FieldId, string>, retrieved: string[] = []) {
  return { task: "Return the complete current state after applying this revision.", previousState, currentRevision: revision.content, retrievedHistoricalContext: retrieved };
}
export function storyStatePrompt(story: StorySequence, revision: Revision, previousState: Record<FieldId, string>, retrieved: string[]) {
  return { task: "Extract only incremental candidate changes with exact current-revision evidence.", previousCanonicalState: previousState, currentRevision: revision.content, retrievedHistoricalContext: retrieved };
}
export function blueprintPrompt(item: OutlineCase) {
  return { task: "Propose a tracking blueprint without inventing unsupported facts.", outline: item.outline, outputFields: ["entity", "fieldType", "scope", "importance", "rationale"] };
}
