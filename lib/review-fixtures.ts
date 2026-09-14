import {
  initialStories,
  writerOutput,
  type Story,
  type Delta,
  type Entity,
} from "./mock-story";
import type { ReasoningDetail } from "./review-contract";

// Curated frontend examples from Benchmark Pilot v0.2.2; no extraction/validator engine.
const detail = (
  chapter: number,
  recommendation: ReasoningDetail["recommendation"],
  why: string,
  checks: ReasoningDetail["checks"] = [],
): ReasoningDetail => ({
  kind: "canonical",
  chapter,
  recommendation,
  risk: recommendation === "AUTO_ACCEPT_ELIGIBLE" ? "LOW" : "HIGH",
  why,
  reason: why,
  checks,
});
const candidate = (
  id: string,
  entityId: string,
  field: string,
  before: string,
  after: string,
  evidence: string,
  review: ReasoningDetail,
): Delta => ({
  id,
  entityId,
  field,
  before,
  after,
  evidence,
  reason: review.reason,
  review,
  risk: review.risk === "LOW" ? "normal" : "high",
  decision: "pending",
});
const p16 = "陈默是市刑侦支队警察，并正在港务安保中卧底";
const p17 = "林夏父亲三天前亲自到 C-19，并亲手留下残页";
export const reviewExamples = [
  { id: "review-ch13", label: "Ch13 · 持有与归属" },
  { id: "review-ch16", label: "Ch16 · 知识边界" },
  { id: "review-ch17", label: "Ch17 · 信念更正" },
];
function demo(
  id: string,
  chapter: number,
  title: string,
  output: string,
  deltas: Delta[],
  prepare: (entities: Entity[]) => void,
): Story {
  const base = structuredClone(initialStories[0]);
  prepare(base.entities);

  return {
    ...base,
    id,
    title: `雾港 · Ch${chapter} 审核示例`,
    description: "独立前端示例 · 精选状态变化，可审核、提交和恢复",
    chapter: chapter - 1,
    currentStateVersion: chapter - 1,
    reviewSource: { chapter, title, output },
    prompt: `查看 Chapter ${chapter} 的精选状态变化。固定示例，不进行生成或整章抽取。`,
    deltas,
    versions: [
      {
        id: `${id}-baseline`,
        stateVersion: chapter - 1,
        chapter: chapter - 1,
        date: base.updated,
        title: `Ch${chapter} 演示前态`,
        changes: ["Benchmark 已确认前态 · 独立 fixture"],
        entities: structuredClone(base.entities),
      },
    ],
  };
}
const evidence16 =
  "市刑侦支队，陈默，警号 071306。我在港务安保里卧底。证件右下角有动态警徽，你在系统里查过这种防伪。";
const ch16 = demo(
  "review-ch16",
  16,
  "C-19 撤离 · Knowledge 精选",
  `${evidence16}\n\n顾言看见徽记随角度变色，也认出证件格式。\n\n林夏已经转过弯，只能看见她手电的余光。\n\n顾言也没有转述刚才的对话。`,
  [
    candidate(
      "c16-gu-p",
      "identity",
      "顾言",
      "unaware",
      "knows",
      evidence16 + "\n顾言看见徽记随角度变色，也认出证件格式。",
      {
        ...detail(
          16,
          "NEEDS_REVIEW",
          "只有顾言接收到完整身份披露，并完成证件检查。",
          [
            { label: "Direct disclosure", passed: true },
            { label: "Credential inspection", passed: true },
            { label: "披露只覆盖顾言", passed: true },
          ],
        ),
        context: `P = ${p16}。Same World Truth ≠ Same Character Knowledge。`,
      },
    ),
    candidate(
      "c16-lin-p",
      "identity",
      "林夏",
      "unaware",
      "unaware",
      "林夏已经转过弯，只能看见她手电的余光。",
      {
        ...detail(16, "REJECT", "林夏未收到 P 的披露，顾言没有转述。"),
        kind: "no_change",
        context: `P = ${p16}`,
      },
    ),
    candidate(
      "c16-lin-q",
      "identity-q",
      "林夏",
      "suspects",
      "suspects",
      "顾言也没有转述刚才的对话。",
      {
        ...detail(16, "REJECT", "Q 的怀疑不能传播为对 P 的怀疑或知识。"),
        kind: "no_change",
        context: "Q = 陈默的公开身份不完整。与 P 是两个独立命题。",
      },
    ),
  ],
  (entities) => {
    entities.find((e) => e.id === "identity-q")!.fields["林夏"] = "suspects";
    entities.find((e) => e.id === "usb")!.fields = {
      owner: "陈默",
      holder: "林夏",
      status: "index_unlocked",
    };
    entities.find((e) => e.id === "lin")!.fields.location = "C-19";
    entities.find((e) => e.id === "gu")!.fields.location = "C-19";
    const chen = entities.find((e) => e.id === "chen")!;
    delete chen.fields.location;
    chen.fields.location_status = "unresolved";
    chen.fields.last_confirmed_location = "Hospital";
    entities
      .filter((e) => e.category === "Plot Threads")
      .forEach((e) => {
        e.fields.status = "progressing";
      });
  },
);
const correctionEvidence =
  "我没有去过十九号冷库。\n三天前只有何叔刷证进入储物区，并把证物袋中的残页放入柜内；父亲的身份记录、面部影像和同行痕迹均未出现。\n所以我错了。父亲没有在三天前来过 C-19；是何叔替他放的，日期也是回填的。";
const cooperationEvidence =
  "这一次我信你。先带我们离开这里，别替我决定下一步。";
const ch17 = demo(
  "review-ch17",
  17,
  "旧泵房解密 · Correction 精选",
  `${correctionEvidence}\n\n${cooperationEvidence}\n\n六份货单、三段录音和权限日志全部变为可读取状态。`,
  [
    candidate(
      "c17-world",
      "father-world",
      "truth",
      "unresolved",
      "confirmed_false",
      correctionEvidence,
      {
        ...detail(
          17,
          "NEEDS_REVIEW",
          "录音与独立门禁、无剪辑影像共同否定父亲亲自到场的命题。",
          [
            { label: "录音提供一致来源说明", passed: true },
            { label: "门禁与无剪辑影像独立确认", passed: true },
          ],
        ),
        context: `P = ${p17}。Hidden author truth 不作为输入。`,
      },
    ),
    {
      ...candidate(
        "c17-belief",
        "father-lin",
        "stance",
        "believes",
        "knows",
        correctionEvidence,
        {
          ...detail(
            17,
            "NEEDS_REVIEW",
            "林夏接触到反证，并明确复述自己的更正。",
            [
              { label: "角色获得 correction evidence", passed: true },
              { label: "保留 previous stance / believed_value", passed: true },
            ],
          ),
          beforeLabel: "相信父亲亲自到过 C-19",
          afterLabel: "确认该判断为假",
          transition: "belief_correction",
          context: `P = ${p17}。correction 是 transition / provenance，不是 stance。`,
        },
      ),
      additionalFields: [
        { field: "believed_value", before: "true", after: "false" },
      ],
    },
    candidate(
      "c17-cooperation",
      "relation",
      "bounded_cooperation",
      "none",
      "active · current escape",
      cooperationEvidence,
      {
        ...detail(
          17,
          "AUTO_ACCEPT_ELIGIBLE",
          "明确声明支持当前撤离中的有界合作。",
          [
            { label: "Explicit declaration", passed: true },
            { label: "Scope = current escape", passed: true },
          ],
        ),
        rule: "Bounded cooperation ≠ long-term trust",
      },
    ),
    candidate(
      "c17-trust-candidate",
      "relation",
      "trust",
      "distrust",
      "trust",
      cooperationEvidence,
      {
        ...detail(
          17,
          "REJECT",
          "“这一次”限定当前行动，不支持长期心理信任已经修复。",
          [
            { label: "明确当前合作", passed: true },
            { label: "长期信任修复的证据", passed: false },
          ],
        ),
        rule: "Long-term trust 保持 distrust",
      },
    ),
    candidate(
      "c17-trust-stable",
      "relation",
      "trust",
      "distrust",
      "distrust",
      cooperationEvidence,
      {
        ...detail(17, "REJECT", "人工确认的长期 distrust 保持不变。"),
        kind: "no_change",
      },
    ),
    candidate(
      "c17-usb",
      "usb",
      "status",
      "index_unlocked",
      "decrypted",
      "六份货单、三段录音和权限日志全部变为可读取状态。",
      detail(17, "AUTO_ACCEPT_ELIGIBLE", "全部目录变为可读取，支持完成解密。", [
        { label: "主体文件解密完成", passed: true },
      ]),
    ),
  ],
  (entities) => {
    entities
      .filter((e) => e.category === "Characters")
      .forEach((e) => {
        e.fields.location = "Maintenance Tunnel";
      });
    entities
      .filter((e) => e.category === "Plot Threads")
      .forEach((e) => {
        e.fields.status = "progressing";
      });
    entities.find((e) => e.id === "identity")!.fields["顾言"] = "knows";
    entities.find((e) => e.id === "identity-q")!.fields["林夏"] = "suspects";
    entities.find((e) => e.id === "relation")!.fields.bounded_cooperation =
      "none";
    entities.find((e) => e.id === "usb")!.fields = {
      owner: "陈默",
      holder: "林夏",
      status: "index_unlocked",
    };
    entities.push({
      id: "father-world",
      category: "Knowledge",
      name: `World Truth · ${p17}`,
      summary: "世界命题；独立于角色 belief",
      fields: { truth: "unresolved" },
      evidence: "Ch15 尚无充分证据确认父亲亲自到场。",
      chapter: 16,
    });
    entities.push({
      id: "father-lin",
      category: "Knowledge",
      name: `林夏 / ${p17}`,
      summary: "角色认知 · stance 与 believed_value 分别记录",
      fields: { stance: "believes", believed_value: "true" },
      evidence: "Ch15 林夏依据残页形成 belief。",
      chapter: 16,
    });
  },
);
export const reviewDemoStories = [
  {
    ...structuredClone(initialStories[0]),
    id: "review-ch13",
    title: "雾港 · Ch13 审核示例",
    reviewSource: { chapter: 13, title: "急诊室的交接", output: writerOutput },
  },
  ch16,
  ch17,
];
// Add examples once; never replace an existing story, decisions or committed history.
export function withReviewExamples(stories: Story[]) {
  return [
    ...stories,
    ...reviewDemoStories
      .filter((d) => !stories.some((s) => s.id === d.id))
      .map((d) => structuredClone(d)),
  ];
}
