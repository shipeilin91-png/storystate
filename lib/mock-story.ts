import {
  canAcceptChange,
  changeFields,
  reviewKind,
  type ReasoningDetail,
} from "./review-contract";
export const categories = [
  "Characters",
  "Knowledge",
  "Relationships",
  "Items",
  "Plot Threads",
  "Events",
] as const;
export type Category = (typeof categories)[number];
export type Entity = {
  id: string;
  category: Category;
  name: string;
  summary: string;
  fields: Record<string, string>;
  evidence: string;
  chapter: number;
};
export type Delta = {
  id: string;
  entityId: string;
  field: string;
  before: string;
  after: string;
  risk: "normal" | "high" | "conflict";
  reason: string;
  evidence: string;
  decision: "pending" | "accepted" | "rejected";
  resolved?: boolean;
  note?: string;
  review?: ReasoningDetail;
  additionalFields?: { field: string; before: string; after: string }[];
};
/* Frontend fixture contract only; not an authoritative backend schema. */
export type Version = {
  id: string;
  stateVersion: number;
  restoredFromStateVersion?: number;
  chapter: number;
  date: string;
  title: string;
  changes: string[];
  entities: Entity[];
  reviewedChanges?: Delta[];
};
export type Story = {
  id: string;
  title: string;
  genre: string;
  description: string;
  updated: string;
  chapter: number;
  currentStateVersion: number;
  ready: boolean;
  imports: string[];
  entities: Entity[];
  deltas: Delta[];
  versions: Version[];
  prompt: string;
  reviewSource?: { chapter: number; title: string; output: string };
};
export const importOptions = [
  "已有章节 · 第 01–12 章",
  "人物设定 · 3 位人物",
  "世界观 / Story Bible",
];
export const fixtureEntities: Entity[] = [
  {
    id: "lin",
    category: "Characters",
    name: "林夏",
    summary: "调查记者 · 叙事视角人物",
    fields: { location: "Home", role: "调查记者", goal: "追查父亲失踪的真相" },
    evidence: "她关上公寓的门，把那张旧照片放在桌上。",
    chapter: 12,
  },
  {
    id: "chen",
    category: "Characters",
    name: "陈默",
    summary: "码头联络人 · 真实身份为卧底",
    fields: { location: "Dock", identity: "卧底", cover: "码头联络人" },
    evidence: "陈默避开监控，用专线向上级报告行动。",
    chapter: 10,
  },
  {
    id: "gu",
    category: "Characters",
    name: "顾言",
    summary: "急诊医生 · 林夏的旧友",
    fields: { location: "Hospital", role: "急诊医生" },
    evidence: "顾言今晚值班，急诊室的灯一直亮着。",
    chapter: 11,
  },
  {
    id: "identity",
    category: "Knowledge",
    name: "P · 陈默是市刑侦支队警察，并正在港务安保中卧底",
    summary: "叙述者已知 ≠ 林夏已知",
    fields: { 林夏: "unaware", 陈默: "knows", 顾言: "unaware" },
    evidence: "“你到底替谁做事？”林夏问。陈默没有回答。",
    chapter: 12,
  },
  {
    id: "relation",
    category: "Relationships",
    name: "林夏 → 陈默",
    summary: "有向关系 · 长期判断与当次合作分别记录",
    fields: { trust: "distrust", direction: "林夏 → 陈默" },
    evidence: "林夏退后一步，没有接他递来的名片。",
    chapter: 12,
  },
  {
    id: "usb",
    category: "Items",
    name: "加密 USB",
    summary: "承载港口货运记录的关键物件",
    fields: { owner: "陈默", holder: "陈默", status: "encrypted" },
    evidence: "陈默把银色 USB 收回大衣内袋。",
    chapter: 12,
  },
  {
    id: "mystery",
    category: "Plot Threads",
    name: "USB Mystery",
    summary: "货运记录与失踪事件之间的联系",
    fields: { status: "open", question: "谁在篡改港口货运记录？" },
    evidence: "编号 0719 的货船，在系统里根本不存在。",
    chapter: 11,
  },
  {
    id: "missing",
    category: "Plot Threads",
    name: "父亲的下落",
    summary: "三年前失踪的港口工程师",
    fields: { status: "open", question: "那张照片是谁寄来的？" },
    evidence: "照片背面的日期，是上周五。",
    chapter: 12,
  },
  {
    id: "dock",
    category: "Events",
    name: "码头交锋",
    summary: "林夏与陈默第一次正面交涉",
    fields: {
      location: "Dock",
      participants: "林夏、陈默",
      outcome: "未取得 USB",
    },
    evidence: "雾笛响起，陈默消失在集装箱之间。",
    chapter: 12,
  },
  {
    id: "call",
    category: "Events",
    name: "顾言的来电",
    summary: "医院出现与旧案相关的伤者",
    fields: {
      location: "Hospital",
      participants: "顾言、林夏",
      outcome: "邀约前往医院",
    },
    evidence: "“来医院一趟，”顾言说，“有个人想见你。”",
    chapter: 12,
  },
];
fixtureEntities.push({
  id: "identity-q",
  category: "Knowledge",
  name: "Q · 陈默的公开身份不完整",
  summary: "独立于完整卧底身份命题 P",
  fields: { 林夏: "unaware" },
  evidence: "林夏尚未接收到完整身份信息。",
  chapter: 12,
});
export const fixtureDeltas: Delta[] = [
  {
    id: "d1",
    entityId: "lin",
    field: "location",
    before: "Home",
    after: "Hospital",
    risk: "normal",
    reason: "新场景明确改变了人物位置。",
    review: {
      kind: "canonical",
      chapter: 13,
      recommendation: "AUTO_ACCEPT_ELIGIBLE",
      risk: "LOW",
      checks: [{ label: "明确到达医院，不是未来意图", passed: true }],
      why: "林夏推开医院的门，人物已在场。",
      reason: "明确场景证据支持位置更新。",
    },
    evidence: "林夏推开门，看见陈默站在走廊尽头。",
    decision: "pending",
  },
  {
    id: "d2",
    entityId: "usb",
    field: "holder",
    before: "陈默",
    after: "林夏",
    risk: "normal",
    reason: "明确发生物理交接，因此 holder 改变；owner 不变。",
    review: {
      kind: "canonical",
      chapter: 13,
      recommendation: "AUTO_ACCEPT_ELIGIBLE",
      risk: "LOW",
      checks: [
        { label: "明确 physical handoff", passed: true },
        { label: "Holder evidence sufficient", passed: true },
      ],
      why: "放进她手里，加上“保管好它”，明确支持实际持有转移。",
      reason: "明确持有转移。",
      rule: "Physical possession ≠ ownership",
      context: "陈默 → 林夏的交接是 source event；这里审核的是 holder effect。",
    },
    evidence: "只从大衣里取出那枚银色 USB，放进她手里。\n\n“保管好它。”",
    decision: "pending",
  },
  {
    id: "d3",
    entityId: "mystery",
    field: "status",
    before: "open",
    after: "progressing",
    risk: "normal",
    reason: "USB 已交接，但货运记录尚未解密。",
    review: {
      kind: "canonical",
      chapter: 13,
      recommendation: "AUTO_ACCEPT_ELIGIBLE",
      risk: "LOW",
      checks: [
        { label: "关键线索已推进", passed: true },
        { label: "未将推进误判为 resolved", passed: true },
      ],
      why: "关键载体完成交接，但内容没有解密。",
      reason: "仅推进线索，不提前关闭问题。",
    },
    evidence: "银色外壳下，藏着那艘货船最后的行踪。",
    decision: "pending",
  },
  {
    id: "d4",
    entityId: "identity",
    field: "林夏",
    before: "unaware",
    after: "knows",
    risk: "conflict",
    reason:
      "与本章“不可揭露卧底身份”的知识边界冲突。证据只支持怀疑，不能证明知情。",
    review: {
      kind: "canonical",
      chapter: 13,
      recommendation: "CONFLICT",
      risk: "CONFLICT",
      checks: [
        { label: "证据足以确认完整卧底身份 P", passed: false },
        { label: "Q 与 P 保持独立", passed: true },
      ],
      why: "“也许并非码头的人”只支持 Q 的怀疑，没有完整身份披露。",
      reason: "拒绝此候选；林夏对 P 保持 unaware。",
      rule: "Same World Truth ≠ Same Character Knowledge",
    },
    evidence: "她忽然明白，他也许并非码头的人。",
    decision: "pending",
  },
  {
    id: "d5-owner",
    entityId: "usb",
    field: "owner",
    before: "陈默",
    after: "林夏",
    risk: "high",
    decision: "pending",
    reason: "交付保管不构成所有权转让。",
    evidence: "只从大衣里取出那枚银色 USB，放进她手里。",
    review: {
      kind: "canonical",
      chapter: 13,
      recommendation: "REJECT",
      risk: "HIGH",
      checks: [
        { label: "Evidence supports possession", passed: true },
        { label: "Evidence of ownership transfer", passed: false },
      ],
      why: "证据支持 possession，没有购买、赠与或明确归属声明。",
      reason: "Owner 保持陈默；此候选不能提交。",
      rule: "Physical possession ≠ ownership",
    },
  },
  {
    id: "d6-soft",
    entityId: "relation",
    field: "心理信任（解释）",
    before: "未形成判断",
    after: "可能开始信任陈默",
    risk: "high",
    decision: "pending",
    reason: "接受 USB、没有追问，可能支持心理解释，不能确认为长期信任。",
    evidence: "她忽然明白，他也许并非码头的人。但她没有问。",
    review: {
      kind: "soft",
      chapter: 13,
      recommendation: "REJECT",
      risk: "HIGH",
      checks: [
        { label: "存在可供解释的行为", passed: true },
        { label: "足以建立 Canonical trust", passed: false },
      ],
      why: "接受 USB 和没有追问也可能出于任务需要。",
      reason: "Soft only · 不进入 Canonical State。",
      rule: "Soft Interpretation ≠ Canonical State",
    },
  },
  {
    id: "d7-q",
    entityId: "identity-q",
    field: "林夏",
    before: "unaware",
    after: "suspects",
    risk: "normal",
    decision: "pending",
    reason: "只对公开身份不完整产生怀疑，不是知道卧底身份。",
    evidence: "他也许并非码头的人。",
    review: {
      kind: "canonical",
      chapter: 13,
      recommendation: "AUTO_ACCEPT_ELIGIBLE",
      risk: "LOW",
      checks: [{ label: "Q 与正式身份 P 独立", passed: true }],
      why: "林夏接触到异常信息，但没有获得完整披露。",
      reason: "仅更新 Q 的 suspects；P 保持 unaware。",
    },
  },
];
export const defaultPrompt =
  "第 13 章，林夏赶到医院，与陈默再次相遇。让 USB 完成交接，推进货船线索；保持林夏的有限视角，不揭露陈默的卧底身份。";
export const writerOutput =
  "急诊室的灯把雨夜照得苍白。林夏推开门，看见陈默站在走廊尽头。\n\n“顾言说你会来。”他没有解释手臂上的伤，只从大衣里取出那枚银色 USB，放进她手里。\n\n“保管好它。”\n\n银色外壳下，藏着那艘货船最后的行踪。\n\n林夏握紧冰冷的金属。她忽然明白，他也许并非码头的人。但她没有问。门后的仪器又响了一声，打断了沉默。";
const baseVersion: Version = {
  id: "v12",
  stateVersion: 12,
  chapter: 12,
  date: "2026-09-10 21:40",
  title: "码头之后",
  changes: ["林夏返回 Home", "林夏 → 陈默：distrust", "新增事件：顾言的来电"],
  entities: structuredClone(fixtureEntities),
};
const olderEntities = fixtureEntities
  .filter((e) => !["call", "dock", "missing"].includes(e.id))
  .map((e) => ({
    ...structuredClone(e),
    chapter: Math.min(e.chapter, 11),
    fields:
      e.id === "lin" ? { ...e.fields, location: "Dock" } : { ...e.fields },
    evidence:
      (
        {
          lin: "林夏站在码头，寻找那艘不存在的货船。",
          identity: "她还无法确认，陈默到底是什么人。",
          relation: "陈默的话，林夏一个字也不信。",
          usb: "USB 在陈默手里，仍然没有解密。",
        } as Record<string, string>
      )[e.id] ?? e.evidence,
  }));
export const initialStories: Story[] = [
  {
    id: "fog-harbor",
    title: "雾港",
    genre: "悬疑 · 连续小说",
    description:
      "一座被雾笼罩的港城，一份消失的货运记录，和三个各自保守秘密的人。",
    updated: baseVersion.date,
    chapter: 12,
    currentStateVersion: 12,
    ready: true,
    imports: [...importOptions],
    entities: structuredClone(fixtureEntities),
    deltas: structuredClone(fixtureDeltas),
    versions: [
      baseVersion,
      {
        id: "v11",
        stateVersion: 11,
        chapter: 11,
        date: "2026-09-09 19:15",
        title: "不存在的货船",
        changes: ["开启 USB Mystery", "顾言位于 Hospital"],
        entities: olderEntities,
      },
    ],
    prompt: defaultPrompt,
  },
];
export function newStory(
  id: string,
  title: string,
  description: string,
): Story {
  return {
    id,
    title: title.trim(),
    description: description.trim(),
    genre: "未分类",
    updated: new Date().toISOString(),
    chapter: 0,
    currentStateVersion: 0,
    ready: false,
    imports: [],
    entities: [],
    deltas: [],
    versions: [],
    prompt: "",
  };
}
export function initializeStory(story: Story): Story {
  if (story.ready || importOptions.some((i) => !story.imports.includes(i)))
    return story;
  return {
    ...story,
    ready: true,
    chapter: 12,
    currentStateVersion: 12,
    entities: structuredClone(fixtureEntities),
    deltas: structuredClone(fixtureDeltas),
    versions: [structuredClone(baseVersion)],
    prompt: defaultPrompt,
    updated: new Date().toISOString(),
  };
}
export function canCommit(story: Story) {
  const canonical = story.deltas.filter((d) => reviewKind(d) === "canonical");
  const accepted = canonical.filter((d) => d.decision === "accepted");
  const paths = accepted.flatMap((d) =>
    changeFields(d).map((f) => `${d.entityId}/${f.field}`),
  );
  return (
    accepted.length > 0 &&
    new Set(paths).size === paths.length &&
    canonical.every(
      (d) =>
        d.decision === "rejected" ||
        (d.decision === "accepted" && canAcceptChange(story, d)),
    )
  );
}
export function commitMock(story: Story, date: string): Story {
  if (!canCommit(story)) return story;
  const accepted = story.deltas.filter(
    (d) => d.decision === "accepted" && reviewKind(d) === "canonical",
  );
  const entities = story.entities.map((e) => ({
    ...e,
    fields: { ...e.fields },
  }));
  for (const delta of accepted) {
    const entity = entities.find((e) => e.id === delta.entityId)!;
    for (const field of changeFields(delta))
      entity.fields[field.field] = field.after.trim();
    entity.evidence = delta.evidence;
    entity.chapter = story.reviewSource?.chapter ?? story.chapter + 1;
  }
  const version: Version = {
    id: `v${story.currentStateVersion + 1}-${date}`,
    stateVersion: story.currentStateVersion + 1,
    chapter: story.reviewSource?.chapter ?? story.chapter + 1,
    date,
    title: story.reviewSource?.title ?? "急诊室的交接",
    changes: accepted.map(
      (d) =>
        `${entities.find((e) => e.id === d.entityId)!.name} · ${changeFields(d)
          .map((f) => `${f.field}: ${f.before} → ${f.after}`)
          .join(" · ")}`,
    ),
    entities: structuredClone(entities),
    reviewedChanges: structuredClone(story.deltas),
  };
  return {
    ...story,
    entities,
    chapter: version.chapter,
    currentStateVersion: version.stateVersion,
    updated: date,
    deltas: [],
    versions: [version, ...story.versions],
  };
}
export function rollbackMock(
  story: Story,
  version: Version,
  date: string,
): Story {
  // Restore only snapshots owned by this story, never a caller's foreign data.
  const source = story.versions.find(
    (candidate) => candidate.id === version.id,
  );
  if (!source || source.id === story.versions[0]?.id) return story;
  const restored: Version = {
    ...structuredClone(source),
    id: `restore-v${story.currentStateVersion + 1}-${date}`,
    stateVersion: story.currentStateVersion + 1,
    restoredFromStateVersion: source.stateVersion,
    date,
    title: `恢复至第 ${source.chapter} 章（模拟）`,
    changes: [
      `Restored from State v${source.stateVersion} · Snapshot chapter: ${source.chapter}`,
    ],
  };
  return {
    ...story,
    entities: structuredClone(source.entities),
    chapter: source.chapter,
    currentStateVersion: restored.stateVersion,
    updated: date,
    deltas: [],
    versions: [restored, ...story.versions],
  };
}
