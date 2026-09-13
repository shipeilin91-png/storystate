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
    name: "陈默的真实身份",
    summary: "叙述者已知 ≠ 林夏已知",
    fields: { 林夏: "unaware", 陈默: "knows", 顾言: "unaware" },
    evidence: "“你到底替谁做事？”林夏问。陈默没有回答。",
    chapter: 12,
  },
  {
    id: "relation",
    category: "Relationships",
    name: "林夏 → 陈默",
    summary: "合作尚未建立，动机仍受怀疑",
    fields: { trust: "distrust", direction: "林夏 → 陈默" },
    evidence: "林夏退后一步，没有接他递来的名片。",
    chapter: 12,
  },
  {
    id: "usb",
    category: "Items",
    name: "加密 USB",
    summary: "内含未解密的港口货运记录",
    fields: { owner: "陈默", status: "encrypted" },
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
export const fixtureDeltas: Delta[] = [
  {
    id: "d1",
    entityId: "lin",
    field: "location",
    before: "Home",
    after: "Hospital",
    risk: "normal",
    reason: "新场景明确改变了人物位置。",
    evidence: "林夏推开门，看见陈默站在走廊尽头。",
    decision: "pending",
  },
  {
    id: "d2",
    entityId: "usb",
    field: "owner",
    before: "陈默",
    after: "林夏",
    risk: "high",
    reason: "关键道具转移，将影响后续可执行行动。",
    evidence: "只从大衣里取出那枚银色 USB，放进她手里。",
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
    evidence: "她忽然明白，他也许并非码头的人。",
    decision: "pending",
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
  return (
    story.deltas.length > 0 &&
    story.deltas.every(
      (d) =>
        d.decision !== "pending" &&
        (d.decision === "rejected" || d.risk !== "conflict" || d.resolved),
    ) &&
    story.deltas.some((d) => d.decision === "accepted") &&
    story.deltas
      .filter((d) => d.decision === "accepted")
      .every(
        (d) =>
          story.entities.find((e) => e.id === d.entityId)?.fields[d.field] ===
            d.before && d.after.trim(),
      )
  );
}
export function commitMock(story: Story, date: string): Story {
  if (!canCommit(story)) return story;
  const accepted = story.deltas.filter((d) => d.decision === "accepted");
  const entities = story.entities.map((e) => ({
    ...e,
    fields: { ...e.fields },
  }));
  for (const delta of accepted) {
    const entity = entities.find((e) => e.id === delta.entityId)!;
    entity.fields[delta.field] = delta.after.trim();
    entity.evidence = delta.evidence;
    entity.chapter = story.chapter + 1;
  }
  const version: Version = {
    id: `v${story.currentStateVersion + 1}-${date}`,
    stateVersion: story.currentStateVersion + 1,
    chapter: story.chapter + 1,
    date,
    title: "急诊室的交接",
    changes: accepted.map(
      (d) =>
        `${entities.find((e) => e.id === d.entityId)!.name} · ${d.field}: ${d.before} → ${d.after}`,
    ),
    entities: structuredClone(entities),
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
