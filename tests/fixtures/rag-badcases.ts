import { extractionDevelopmentDataset, extractionDevelopmentIds as ids } from "./extraction-development";
import type { CanonicalState, StoryAggregate, DeltaInput } from "../../lib/domain/state";
import { stableUuid, contentHash } from "../../lib/rag/chunks";

export type ExpectedRagEffect = Pick<DeltaInput, "targetType" | "targetId" | "fieldPath"> & { after: unknown };
export type RagCase = {
  id: string; group: "old_state" | "custody" | "belief_report" | "pronouns" | "redundant" | "reversals";
  derivedFrom: string; current: string; history: string[]; state: CanonicalState;
  expected: ExpectedRagEffect[];
};
const base = (id = "D04") => structuredClone(extractionDevelopmentDataset.cases.find(c => c.caseId === id)!.baseState);
const passage = (id: string) => extractionDevelopmentDataset.cases.find(c => c.caseId === id)!.passage;
const ep = (value: string) => ({ value, status: "resolved", lastConfirmedValue: value });
const holder = (person: string, item = ids.ITEM_RECORDER): ExpectedRagEffect =>
  ({ targetType: "items", targetId: item, fieldPath: "holder", after: ep(person) });
const place = (person: string, location: string): ExpectedRagEffect =>
  ({ targetType: "characters", targetId: person, fieldPath: "location", after: ep(location) });

const alreadyHeld = base();
alreadyHeld.items.find(r => r.id === ids.ITEM_RECORDER)!.holder = ep(ids.CHAR_CHENG) as CanonicalState["items"][number]["holder"];
const ragCases: RagCase[] = [
  { id: "R01", group: "old_state", derivedFrom: "D02/D14", current: passage("D02"), state: base(),
    history: ["三天前，纪川进入控制室并在那里修理终端。"], expected: [] },
  { id: "R02", group: "old_state", derivedFrom: "D14", current: passage("D14"), state: base("D14"),
    history: ["昨天纪川回到维修间。后来他前往医务室休息。"], expected: [] },
  { id: "R03", group: "custody", derivedFrom: "D04", current: passage("D04"), state: base(),
    history: ["纪川强调黑匣记录器属于自己，程雾之前只借用过它。"], expected: [holder(ids.CHAR_CHENG)] },
  { id: "R04", group: "custody", derivedFrom: "D04 + frozen item_custodian",
    current: "程雾接替纪川负责保管黑匣记录器。记录器仍由纪川拿在手里，所有权仍归纪川。", state: base(),
    history: ["黑匣记录器一直由纪川持有。"], expected: [{ targetType: "items", targetId: ids.ITEM_RECORDER, fieldPath: "custodian", after: ep(ids.CHAR_CHENG) }] },
  { id: "R05", group: "belief_report", derivedFrom: "D06", current: passage("D06"), state: base("D06"),
    history: ["顾屿把停电归咎于备用线圈，但此说法尚未证实。唐岚没有听到那次谈话。"],
    expected: [{ targetType: "knowledge", targetId: ids.KNOW_TANG_REPORT_SHORT, fieldPath: "$", after: { characterId: ids.CHAR_TANG, propositionId: ids.PROP_REPORT_SHORT, stance: "knows", believedValue: true } }] },
  { id: "R06", group: "belief_report", derivedFrom: "D09", current: passage("D09"), state: base("D09"),
    history: ["纪川曾相信备用线圈短路导致停电，这只是他的推测。"],
    expected: [
      { targetType: "knowledge", targetId: ids.KNOW_JI_SHORT, fieldPath: "$", after: { characterId: ids.CHAR_JI, propositionId: ids.PROP_SHORT, stance: "knows", believedValue: false } },
      { targetType: "worldTruth", targetId: ids.WORLD_SHORT, fieldPath: "$", after: { propositionId: ids.PROP_SHORT, status: "confirmed_false" } },
    ] },
  { id: "R07", group: "pronouns", derivedFrom: "D01", current: "他终于推开控制室的门，走了进去。", state: base(),
    history: ["纪川独自站在维修间门内，准备检查线路。"], expected: [place(ids.CHAR_JI, "Control Room")] },
  { id: "R08", group: "pronouns", derivedFrom: "D04 + existing North Key",
    current: "她把它递给唐岚，唐岚接过钥匙，临时拿在手里。", state: base(),
    history: ["程雾拿着北门机械钥匙站在唐岚面前，两人正在谈论这把钥匙。"],
    expected: [holder(ids.CHAR_TANG, ids.ITEM_NORTH_KEY)] },
  { id: "R09", group: "redundant", derivedFrom: "D04 + already-current holder", current: "程雾仍然拿着黑匣记录器。", state: alreadyHeld,
    history: ["纪川拿着黑匣记录器。", "纪川随后把记录器递给程雾，让她先拿着。"], expected: [] },
  { id: "R10", group: "redundant", derivedFrom: "D02 + already-current location", current: "纪川仍在维修间。", state: base(),
    history: ["三天前纪川在控制室。后来纪川回到维修间。"], expected: [] },
  { id: "R11", group: "reversals", derivedFrom: "D04 repeated A-B-A-B",
    current: "纪川又把黑匣记录器递给程雾：“你先拿着。”", state: base(),
    history: ["纪川将黑匣记录器递给程雾，暂时借用。", "程雾用完后把记录器交还纪川，纪川接住了。"],
    expected: [holder(ids.CHAR_CHENG)] },
  { id: "R12", group: "reversals", derivedFrom: "frozen item_condition repeated reversal",
    current: "黑匣记录器再次摔坏，已经不能工作。", state: base(),
    history: ["黑匣记录器摔坏，无法工作。", "纪川修好黑匣记录器，它恢复正常工作。"],
    expected: [{ targetType: "items", targetId: ids.ITEM_RECORDER, fieldPath: "condition", after: "damaged" }] },
];
// Fixed before live execution. Every live arm uses exactly these same cases.
export const evidenceRagCases = ragCases;
export const ragDatasetHash = contentHash(JSON.stringify(ragCases));

export function ragAggregate(c: RagCase): { aggregate: StoryAggregate; revisionId: string } {
  const storyId = stableUuid(`rag-case/${c.id}`);
  const texts = [...c.history, c.current];
  const documents = texts.map((_, i) => ({
    id: stableUuid(`${storyId}/document/${i}`), title: `北岬站 ${i + 1}`, sourceOrder: i + 1, chapter: i + 1,
  }));
  const revisions = texts.map((content, i) => ({
    id: stableUuid(`${storyId}/revision/${i}`), documentId: documents[i].id,
    revisionNumber: 1, content, visibility: "canonical" as const,
  }));
  return {
    aggregate: {
      story: { id: storyId, title: `Evidence RAG ${c.id}`, currentVersion: 1, currentChapter: texts.length, storyRevision: texts.length, createdAt: "2026-09-17T00:00:00.000Z" },
      state: structuredClone(c.state), documents, revisions, evidence: [], events: [], deltas: [], versions: [], annotations: [],
    },
    revisionId: revisions.at(-1)!.id,
  };
}
