import { createHash } from "node:crypto";
import { canonicalSchema, type CanonicalState } from "../../lib/domain/state";
import { deepFreeze, digest } from "../../lib/eval/contract";
import { aliasEntrySchema, extractionCaseSchema, minimalPairSchema, type ExtractionDevelopmentCase, type GoldEffect } from "../../lib/eval/extraction/contract";

function deterministicUuid(label: string): string {
  const hex = createHash("sha256").update(`storystate/extraction-development/v0.1/${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4"; hex[16] = "8";
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

const ids = Object.fromEntries([
  "CHAR_JI", "CHAR_CHENG", "CHAR_TANG", "CHAR_GU", "ITEM_RECORDER", "ITEM_NORTH_KEY", "THREAD_POWER",
  "PROP_SHORT", "PROP_AUDITOR", "PROP_REPORT_SHORT", "WORLD_SHORT", "KNOW_JI_SHORT", "KNOW_JI_AUDITOR",
  "KNOW_TANG_SHORT", "KNOW_TANG_REPORT_SHORT", "REL_COOP", "REL_TRUST",
].map(alias => [alias, deterministicUuid(alias)])) as Record<string, string>;

const humanBasis = { kinds: ["human_confirmation"] as const, note: "Deterministic development benchmark base state" };
const inferenceBasis = { kinds: ["inference"] as const, note: "Deterministic pre-existing belief for correction case" };
const location = (value: string | null, lastConfirmedValue = value) => ({ value, status: value === null ? "unresolved" as const : "resolved" as const, lastConfirmedValue });

function commonState(): CanonicalState {
  return canonicalSchema.parse({
    characters: [
      { id: ids.CHAR_JI, active: true, name: "纪川", role: "维修工程师", location: location("Maintenance Room") },
      { id: ids.CHAR_CHENG, active: true, name: "程雾", role: "安保负责人", location: location("Security Office") },
      { id: ids.CHAR_TANG, active: true, name: "唐岚", role: "医务人员", location: location("Infirmary") },
      { id: ids.CHAR_GU, active: true, name: "顾屿", role: "补给承包员", location: location("Supply Dock") },
    ],
    items: [
      { id: ids.ITEM_RECORDER, active: true, name: "黑匣记录器", owner: location(ids.CHAR_JI), holder: location(ids.CHAR_JI), custodian: null, condition: "operational" },
      { id: ids.ITEM_NORTH_KEY, active: true, name: "北门机械钥匙", owner: location(ids.CHAR_CHENG), holder: location(ids.CHAR_CHENG), custodian: null, condition: "operational" },
    ],
    plotThreads: [{ id: ids.THREAD_POWER, active: true, title: "停电原因", coreQuestion: "谁切断了北岬站主配电？", status: "open", resolution: null }],
    propositions: [
      { id: ids.PROP_SHORT, active: true, statement: "备用线圈短路导致了停电", kind: "assertion", reportedPropositionId: null, reporterId: null },
      { id: ids.PROP_AUDITOR, active: true, statement: "程雾正在执行总部秘密审查任务", kind: "assertion", reportedPropositionId: null, reporterId: null },
      { id: ids.PROP_REPORT_SHORT, active: true, statement: "顾屿声称备用线圈短路导致了停电", kind: "reported", reportedPropositionId: ids.PROP_SHORT, reporterId: ids.CHAR_GU },
    ],
    worldTruth: [{ id: ids.WORLD_SHORT, active: true, propositionId: ids.PROP_SHORT, status: "unresolved" }],
    knowledge: [
      { id: ids.KNOW_JI_SHORT, active: true, characterId: ids.CHAR_JI, propositionId: ids.PROP_SHORT, stance: "believes", believedValue: true, basis: inferenceBasis },
      { id: ids.KNOW_JI_AUDITOR, active: true, characterId: ids.CHAR_JI, propositionId: ids.PROP_AUDITOR, stance: "unaware", believedValue: null, basis: humanBasis },
      { id: ids.KNOW_TANG_SHORT, active: true, characterId: ids.CHAR_TANG, propositionId: ids.PROP_SHORT, stance: "unaware", believedValue: null, basis: humanBasis },
      { id: ids.KNOW_TANG_REPORT_SHORT, active: true, characterId: ids.CHAR_TANG, propositionId: ids.PROP_REPORT_SHORT, stance: "unaware", believedValue: null, basis: humanBasis },
    ],
    relationships: [
      { id: ids.REL_COOP, active: true, fromCharacterId: ids.CHAR_CHENG, toCharacterId: ids.CHAR_JI, category: "explicit_operational", predicate: "cooperation", value: "inactive", scope: "current rescue", basis: humanBasis },
      { id: ids.REL_TRUST, active: true, fromCharacterId: ids.CHAR_CHENG, toCharacterId: ids.CHAR_JI, category: "human_confirmed_psychological", predicate: "trust", value: "distrust", scope: "continuing", basis: humanBasis },
    ],
  });
}

function stateFor(caseId: string): CanonicalState {
  const state = structuredClone(commonState());
  const ji = state.characters.find(value => value.id === ids.CHAR_JI)!;
  const gu = state.characters.find(value => value.id === ids.CHAR_GU)!;
  const thread = state.plotThreads[0], cooperation = state.relationships.find(value => value.id === ids.REL_COOP)!;
  if (caseId === "D01") ji.location = location("Airlock");
  if (caseId === "D03") gu.location = location("Supply Dock");
  if (caseId === "D10") { thread.status = "open"; thread.resolution = null; }
  if (caseId === "D11") { thread.status = "progressing"; thread.resolution = null; }
  if (caseId === "D13") cooperation.scope = "investigation until power-cut truth is resolved";
  if (caseId === "D14") ji.location = location("Infirmary");
  return canonicalSchema.parse(state);
}

const evidence = (quote: string, occurrence = 0) => [{ quote, occurrence }];
const goldBase = (effectId: string, quote: string, impactClass: "low" | "high" = "low", compilerExpectation: "compile" | "compile_with_correction_provenance" = "compile") => ({
  effectId, requiredEvidence: evidence(quote), evidenceRequirement: "any" as const, impactClass, compilerExpectation,
});

export function buildExtractionDevelopmentDataset() {
  const catalog = [
    ["CHAR_JI", "character", ["纪川", "维修工程师"]],
    ["CHAR_CHENG", "character", ["程雾", "安保负责人"]],
    ["CHAR_TANG", "character", ["唐岚", "医务人员"]],
    ["CHAR_GU", "character", ["顾屿", "补给承包员"]],
    ["ITEM_RECORDER", "item", ["黑匣记录器", "记录器"]],
    ["ITEM_NORTH_KEY", "item", ["北门机械钥匙"]],
    ["THREAD_POWER", "thread", ["停电原因"]],
    ["PROP_SHORT", "proposition", ["备用线圈短路导致了停电"]],
    ["PROP_AUDITOR", "proposition", ["程雾正在执行总部秘密审查任务"]],
    ["PROP_REPORT_SHORT", "proposition", ["顾屿声称备用线圈短路导致了停电"]],
    ["REL_COOP", "relationship", ["程雾→纪川 explicit_operational cooperation"]],
    ["REL_TRUST", "relationship", ["程雾→纪川 human_confirmed_psychological trust"]],
  ].map(([alias, kind, labels]) => aliasEntrySchema.parse({ alias, id: ids[alias as string], kind, labels }));

  const rawCases = [
    {
      caseId: "D01", title: "ARRIVAL", passage: "纪川穿过气闸，推开控制室的门，把工具箱放在桌边。",
      goldEffects: [{ ...goldBase("G-D01-1", "推开控制室的门"), kind: "character_location", semanticTarget: { characterRef: "CHAR_JI" }, expectedAfter: { value: "Control Room", status: "resolved", lastConfirmedValue: "Control Room" } }],
      forbiddenEffects: [], metadata: { negative: false, boundaryTags: ["direction_vs_arrival", "historical_vs_current"], minimalPairIds: ["MP01", "MP02"] },
    },
    {
      caseId: "D02", title: "DIRECTION ONLY", passage: "纪川冲出维修间，沿走廊朝控制室跑去。", goldEffects: [],
      forbiddenEffects: [{ forbiddenId: "F-D02-1", kind: "character_location", semanticTarget: { characterRef: "CHAR_JI" }, forbiddenAfter: { value: "Control Room", status: "resolved", lastConfirmedValue: "Control Room" }, boundary: "direction_vs_arrival" }],
      metadata: { negative: true, boundaryTags: ["direction_vs_arrival"], minimalPairIds: ["MP01"] },
    },
    {
      caseId: "D03", title: "DEPARTURE UNKNOWN", passage: "顾屿离开补给码头，没有告诉任何人自己要去哪。",
      goldEffects: [{ ...goldBase("G-D03-1", "顾屿离开补给码头"), kind: "character_location", semanticTarget: { characterRef: "CHAR_GU" }, expectedAfter: { value: null, status: "unresolved", lastConfirmedValue: "Supply Dock" } }],
      forbiddenEffects: [{ forbiddenId: "F-D03-1", kind: "character_location", semanticTarget: { characterRef: "CHAR_GU" }, forbiddenAfter: { value: "Control Room", status: "resolved", lastConfirmedValue: "Control Room" }, boundary: "historical_vs_current" }],
      metadata: { negative: false, boundaryTags: ["historical_vs_current"], minimalPairIds: [] },
    },
    {
      caseId: "D04", title: "HOLDER ONLY", passage: "纪川把黑匣记录器递给程雾：“你先拿着。”",
      goldEffects: [{ ...goldBase("G-D04-1", "纪川把黑匣记录器递给程雾"), kind: "item_holder", semanticTarget: { itemRef: "ITEM_RECORDER" }, expectedAfter: { valueRef: "CHAR_CHENG", status: "resolved", lastConfirmedValueRef: "CHAR_CHENG" } }],
      forbiddenEffects: [{ forbiddenId: "F-D04-1", kind: "item_owner", semanticTarget: { itemRef: "ITEM_RECORDER" }, forbiddenAfter: { valueRef: "CHAR_CHENG", status: "resolved", lastConfirmedValueRef: "CHAR_CHENG" }, boundary: "holder_vs_owner" }],
      metadata: { negative: false, boundaryTags: ["holder_vs_owner"], minimalPairIds: ["MP03"] },
    },
    {
      caseId: "D05", title: "OWNER + HOLDER", passage: "纪川把记录器放进程雾手里：“这东西以后归你。”",
      goldEffects: [
        { ...goldBase("G-D05-1", "纪川把记录器放进程雾手里"), kind: "item_holder", semanticTarget: { itemRef: "ITEM_RECORDER" }, expectedAfter: { valueRef: "CHAR_CHENG", status: "resolved", lastConfirmedValueRef: "CHAR_CHENG" } },
        { ...goldBase("G-D05-2", "这东西以后归你", "high"), kind: "item_owner", semanticTarget: { itemRef: "ITEM_RECORDER" }, expectedAfter: { valueRef: "CHAR_CHENG", status: "resolved", lastConfirmedValueRef: "CHAR_CHENG" } },
      ], forbiddenEffects: [], metadata: { negative: false, boundaryTags: ["holder_vs_owner"], minimalPairIds: ["MP03"] },
    },
    {
      caseId: "D06", title: "REPORTED PROPOSITION", passage: "程雾对唐岚说：“顾屿说停电是备用线圈短路造成的。”",
      goldEffects: [{ ...goldBase("G-D06-1", "顾屿说停电是备用线圈短路造成的", "high"), kind: "knowledge_state", semanticTarget: { characterRef: "CHAR_TANG", propositionRef: "PROP_REPORT_SHORT" }, expectedAfter: { stance: "knows", believedValue: true } }],
      forbiddenEffects: [
        { forbiddenId: "F-D06-1", kind: "knowledge_state", semanticTarget: { characterRef: "CHAR_TANG", propositionRef: "PROP_SHORT" }, forbiddenAfter: { stance: "knows", believedValue: true }, boundary: "reported_vs_underlying" },
        { forbiddenId: "F-D06-2", kind: "knowledge_state", semanticTarget: { characterRef: "CHAR_TANG", propositionRef: "PROP_SHORT" }, forbiddenAfter: { stance: "believes", believedValue: true }, boundary: "reported_vs_underlying" },
        { forbiddenId: "F-D06-3", kind: "world_truth_status", semanticTarget: { propositionRef: "PROP_SHORT" }, forbiddenAfter: { status: "confirmed_true" }, boundary: "reported_vs_underlying" },
      ], metadata: { negative: false, boundaryTags: ["reported_vs_underlying"], minimalPairIds: ["MP04"] },
    },
    {
      caseId: "D07", title: "DIRECT DOCUMENTARY KNOWLEDGE", passage: "程雾把检修报告递给唐岚。报告结论写着：“备用线圈短路导致了停电。”",
      goldEffects: [{ ...goldBase("G-D07-1", "备用线圈短路导致了停电", "high"), kind: "knowledge_state", semanticTarget: { characterRef: "CHAR_TANG", propositionRef: "PROP_SHORT" }, expectedAfter: { stance: "knows", believedValue: true } }],
      forbiddenEffects: [], metadata: { negative: false, boundaryTags: ["reported_vs_underlying"], minimalPairIds: ["MP04"] },
    },
    {
      caseId: "D08", title: "SUSPICION", passage: "纪川看见程雾藏起一枚总部内审徽章，第一次怀疑她可能正在执行秘密审查。",
      goldEffects: [{ ...goldBase("G-D08-1", "第一次怀疑她可能正在执行秘密审查"), kind: "knowledge_state", semanticTarget: { characterRef: "CHAR_JI", propositionRef: "PROP_AUDITOR" }, expectedAfter: { stance: "suspects", believedValue: null } }],
      forbiddenEffects: [
        { forbiddenId: "F-D08-1", kind: "knowledge_state", semanticTarget: { characterRef: "CHAR_JI", propositionRef: "PROP_AUDITOR" }, forbiddenAfter: { stance: "believes", believedValue: true }, boundary: "suspicion_vs_belief" },
        { forbiddenId: "F-D08-2", kind: "knowledge_state", semanticTarget: { characterRef: "CHAR_JI", propositionRef: "PROP_AUDITOR" }, forbiddenAfter: { stance: "knows", believedValue: true }, boundary: "belief_vs_knowledge" },
      ], metadata: { negative: false, boundaryTags: ["suspicion_vs_belief", "belief_vs_knowledge"], minimalPairIds: [] },
    },
    {
      caseId: "D09", title: "BELIEF CORRECTION + WORLD TRUTH", passage: "日志显示线圈短路发生在断电之后。纪川读完说：“我之前想错了，停电不是线圈短路造成的。”",
      goldEffects: [
        { ...goldBase("G-D09-1", "我之前想错了，停电不是线圈短路造成的", "high", "compile_with_correction_provenance"), kind: "knowledge_state", semanticTarget: { characterRef: "CHAR_JI", propositionRef: "PROP_SHORT" }, expectedAfter: { stance: "knows", believedValue: false } },
        { ...goldBase("G-D09-2", "日志显示线圈短路发生在断电之后", "high"), kind: "world_truth_status", semanticTarget: { propositionRef: "PROP_SHORT" }, expectedAfter: { status: "confirmed_false" } },
      ], forbiddenEffects: [], metadata: { negative: false, boundaryTags: ["belief_vs_knowledge", "soft_interpretation_as_hard_state"], minimalPairIds: [] },
    },
    {
      caseId: "D10", title: "PLOT PROGRESS", passage: "主配电开关上检测到了顾屿的指纹。",
      goldEffects: [{ ...goldBase("G-D10-1", "主配电开关上检测到了顾屿的指纹"), kind: "plot_thread_status", semanticTarget: { threadRef: "THREAD_POWER" }, expectedAfter: { status: "progressing", resolution: null, resolutionAssessment: null } }],
      forbiddenEffects: [{ forbiddenId: "F-D10-1", kind: "plot_thread_status", semanticTarget: { threadRef: "THREAD_POWER" }, forbiddenAfter: { status: "resolved", resolution: "顾屿切断主配电", resolutionAssessment: "strong_inference" }, boundary: "progress_vs_resolution" }],
      metadata: { negative: false, boundaryTags: ["progress_vs_resolution"], minimalPairIds: ["MP05"] },
    },
    {
      caseId: "D11", title: "PLOT RESOLUTION", passage: "顾屿低声说：“主配电是我切的。”监控日志同时记录了他的门禁卡在断电前进入配电室。",
      goldEffects: [{ ...goldBase("G-D11-1", "主配电是我切的", "high"), kind: "plot_thread_status", semanticTarget: { threadRef: "THREAD_POWER" }, expectedAfter: { status: "resolved", resolution: "顾屿切断了主配电", resolutionAssessment: "direct_answer" } }],
      forbiddenEffects: [], metadata: { negative: false, boundaryTags: ["progress_vs_resolution"], minimalPairIds: ["MP05"] },
    },
    {
      caseId: "D12", title: "BOUNDED COOPERATION", passage: "程雾对纪川说：“这次我跟你合作，只为了先把唐岚救出来。之后我们各走各的。”",
      goldEffects: [{ ...goldBase("G-D12-1", "这次我跟你合作，只为了先把唐岚救出来"), kind: "relationship_value", semanticTarget: { relationshipRef: "REL_COOP" }, expectedAfter: { value: "active", scope: "current rescue" } }],
      forbiddenEffects: [
        { forbiddenId: "F-D12-1", kind: "relationship_value", semanticTarget: { relationshipRef: "REL_COOP" }, forbiddenAfter: { value: "active", scope: "ongoing cooperation" }, boundary: "bounded_cooperation_vs_trust" },
        { forbiddenId: "F-D12-2", kind: "relationship_value", semanticTarget: { relationshipRef: "REL_TRUST" }, forbiddenAfter: { value: "trust", scope: "continuing" }, boundary: "bounded_cooperation_vs_trust" },
      ], metadata: { negative: false, boundaryTags: ["bounded_cooperation_vs_trust"], minimalPairIds: ["MP06"] },
    },
    {
      caseId: "D13", title: "GENERAL OPERATIONAL COOPERATION", passage: "程雾对纪川说：“在查清停电真相之前，我们一直合作。”",
      goldEffects: [{ ...goldBase("G-D13-1", "在查清停电真相之前，我们一直合作"), kind: "relationship_value", semanticTarget: { relationshipRef: "REL_COOP" }, expectedAfter: { value: "active", scope: "investigation until power-cut truth is resolved" } }],
      forbiddenEffects: [], metadata: { negative: false, boundaryTags: ["bounded_cooperation_vs_trust"], minimalPairIds: ["MP06"] },
    },
    {
      caseId: "D14", title: "HISTORICAL LOCATION ONLY", passage: "三天前，纪川曾在控制室修过一整夜的终端。", goldEffects: [],
      forbiddenEffects: [{ forbiddenId: "F-D14-1", kind: "character_location", semanticTarget: { characterRef: "CHAR_JI" }, forbiddenAfter: { value: "Control Room", status: "resolved", lastConfirmedValue: "Control Room" }, boundary: "historical_vs_current" }],
      metadata: { negative: true, boundaryTags: ["historical_vs_current"], minimalPairIds: ["MP02"] },
    },
  ];

  const cases: ExtractionDevelopmentCase[] = rawCases.map(value => extractionCaseSchema.parse({ ...value, baseState: stateFor(value.caseId) }));
  const minimalPairs = [
    { pairId: "MP01", caseIds: ["D01", "D02"], boundary: "arrival vs movement toward destination" },
    { pairId: "MP02", caseIds: ["D01", "D14"], boundary: "current arrival vs historical presence" },
    { pairId: "MP03", caseIds: ["D04", "D05"], boundary: "holder transfer vs ownership transfer" },
    { pairId: "MP04", caseIds: ["D06", "D07"], boundary: "reported proposition vs underlying proposition" },
    { pairId: "MP05", caseIds: ["D10", "D11"], boundary: "progress evidence vs direct resolution" },
    { pairId: "MP06", caseIds: ["D12", "D13"], boundary: "bounded operational cooperation vs broader explicit operational cooperation" },
  ].map(value => minimalPairSchema.parse(value));
  return deepFreeze({ version: "stage-2.3a/extraction-development-v0.1", universe: "北岬站", catalog, cases, minimalPairs });
}

export const extractionDevelopmentDataset = buildExtractionDevelopmentDataset();
export const developmentDatasetHash = digest(extractionDevelopmentDataset);
export const extractionDevelopmentIds = deepFreeze({ ...ids });
export type ExtractionDevelopmentDataset = ReturnType<typeof buildExtractionDevelopmentDataset>;
export type ExtractionDevelopmentGold = GoldEffect;
