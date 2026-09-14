import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { CanonicalRow, CanonicalState, CharacterKnowledgeState, DeltaInput, Event, Proposition, StateDelta, TargetType } from "../../lib/domain/state";
import { MemoryStateRepository } from "../../lib/repositories/memory-state-repository";
import { StateService } from "../../lib/server/state-service";
import { accept, createStory, epistemic, human, proposal, seedRecords } from "../helpers/backend";

// Hand-authored ground truth mapping, NOT extraction. Only Chapter Text is ingested;
// expected outcomes and hidden author annotations never enter canonical sources.
const benchmark = readFileSync("docs/BENCHMARK_PILOT_V0.2.2.md", "utf8");
export const statements = {
  P: "陈默是市刑侦支队警察，并正在港务安保中卧底",
  Q: "陈默的公开身份不完整",
  F: "父亲三天前亲自到过 C-19，并亲手留下残页",
  RF: "林夏声称父亲三天前亲自到过 C-19，并亲手留下残页",
  marker: "反向双勾是林夏父亲惯用标记",
  RMarker: "林夏声称反向双勾是其父亲惯用标记",
  entrusted: "林夏父亲让何叔留下这句话",
  RHe: "何叔声称林夏父亲让他留下这句话",
  destination: "林夏父亲将被送往北堤中转站",
  RDestination: "录音中的父亲声称自己当时将被送往北堤中转站",
  currentAlive: "父亲在六月二十日当前仍活着",
  currentNorth: "父亲当前位于北堤中转站",
  handoff: "陈默持有并主动交出了银色 USB",
  ship: "USB 与货船最后行踪有关",
  code: "0719 指第七码头十九号冷库，不是船号",
  directory: "USB 目录包含六份货单、三段录音和一份权限日志",
  contents: "USB 主体文件内容",
  markings: "C-19 的货单残页带有父亲惯用的 LZY 与反向双勾",
  keyLength: "残页背面字符长度与 USB 第二层密钥提示一致",
  sms: "陈默号码建议他们走维修梯",
  sender: "Chapter 15 的短信确由陈默本人发送",
  credential: "陈默出示的证件具备顾言熟悉的动态警徽与正确格式",
  disclosurePlan: "陈默计划稍后亲自向林夏说明身份",
  target: "陈默的卧底目标是周启明",
  tampering: "周启明本人通过实名动态认证、专属终端和唯一授权链执行删除、改号及日期回填",
  equipment: "不存在的货船记录用于掩盖运往 C-19 的设备",
  historicalAlive: "林夏父亲在六月十七日录制音频时仍活着并即将被转移",
  placement: "残页确由何叔放入 C-19，父亲未在三天前到场",
  fatherAccount: "残页由父亲一个月前交给何叔，并由何叔放入 C-19",
  RFatherAccount: "父亲声称残页由他一个月前交给何叔，并由何叔放入 C-19",
};
export const usbQuestion = "谁在篡改港口货运记录？";
export const fatherQuestion = "那张照片是谁寄来的？";
export const usbAnswer = "周启明本人实施货运记录篡改";
export const basis = (...kinds: DeltaInput["basis"]["kinds"]): DeltaInput["basis"] => ({ kinds, note: "Frozen Benchmark explicit evidence and character access" });

export class Pilot {
  repository = new MemoryStateRepository();
  service = new StateService(this.repository);
  storyId = "";
  ids = new Map<string, string>();
  events = new Map<string, Event>();
  deltas = new Map<string, StateDelta>();
  chapter = 12;
  revisionId = "";
  source = "";
  pending: string[] = [];
  id(key: string) {
    if (!this.ids.has(key)) this.ids.set(key, randomUUID());
    return this.ids.get(key)!;
  }
  async state() { return (await this.service.getCurrentState(this.storyId)).state; }
  async row<T extends TargetType>(type: T, key: string): Promise<CanonicalState[T][number]> {
    const row = (await this.state())[type].find(row => row.id === this.id(key));
    assert.ok(row, `${type}/${key} exists`);
    return row;
  }
  proposition(key: keyof typeof statements, reported?: keyof typeof statements, reporter?: string): Proposition {
    return { id: this.id(key), active: true, statement: statements[key], kind: reported ? "reported" : "assertion", reportedPropositionId: reported ? this.id(reported) : null, reporterId: reporter ? this.id(reporter) : null };
  }
  knowledge(who: string, key: keyof typeof statements, stance: CharacterKnowledgeState["stance"] = "unaware", believedValue: boolean | null = null, provenance = human): CharacterKnowledgeState {
    return { id: this.id(`${who}/${key}`), active: true, characterId: this.id(who), propositionId: this.id(key), stance, believedValue, basis: provenance };
  }
  async seed() {
    this.storyId = await createStory(this.service);
    const records: [TargetType, CanonicalRow][] = [];
    for (const [key, name, location, role] of [
      ["Lin", "林夏", "Home", "调查记者"], ["Chen", "陈默", "Dock", "码头联络人"],
      ["Gu", "顾言", "Hospital", "急诊医生"], ["He", "何叔", null, "伤者"],
      ["Father", "林夏父亲", null, "失踪者"],
    ] as const) records.push(["characters", { id: this.id(key), active: true, name, role, location: epistemic(location) }]);
    records.push(
      ["items", { id: this.id("USB"), active: true, name: "加密 USB", owner: epistemic(this.id("Chen")), holder: epistemic(this.id("Chen")), custodian: null, condition: "encrypted" }],
      ["plotThreads", { id: this.id("USB Mystery"), active: true, title: "USB Mystery", coreQuestion: usbQuestion, status: "open", resolution: null }],
      ["plotThreads", { id: this.id("Father Thread"), active: true, title: "父亲的下落", coreQuestion: fatherQuestion, status: "open", resolution: null }],
      ["relationships", { id: this.id("trust"), active: true, fromCharacterId: this.id("Lin"), toCharacterId: this.id("Chen"), category: "human_confirmed_psychological", predicate: "long_term_trust", value: "distrust", scope: "continuing", basis: human }],
    );
    // Proposition identities/unaware slots are test addressing scaffolding, not future truth.
    const reported: Partial<Record<keyof typeof statements, [keyof typeof statements, string]>> = {
      RF: ["F", "Lin"], RMarker: ["marker", "Lin"], RHe: ["entrusted", "He"],
      RDestination: ["destination", "Father"], RFatherAccount: ["fatherAccount", "Father"],
    };
    for (const key of Object.keys(statements) as (keyof typeof statements)[]) {
      const report = reported[key];
      records.push(["propositions", this.proposition(key, report?.[0], report?.[1])]);
      for (const who of ["Lin", "Gu", "Chen"]) records.push(["knowledge", this.knowledge(who, key)]);
    }
    const chenIdentity = records.find(([, row]) => row.id === this.id("Chen/P"))![1] as CharacterKnowledgeState;
    chenIdentity.stance = "knows"; chenIdentity.believedValue = true;
    for (const [key, status] of [["P", "confirmed_true"], ["F", "unresolved"], ["entrusted", "unresolved"]] as const)
      records.push(["worldTruth", { id: this.id(`World/${key}`), active: true, propositionId: this.id(key), status }]);
    await seedRecords(this.service, this.storyId, records);
  }
  async begin(chapter: number) {
    this.chapter = chapter; this.pending = [];
    const section = benchmark.split(`## Chapter ${chapter} `)[1];
    assert.ok(section, `Frozen Ch${chapter} exists`);
    this.source = section.split("### 3. Chapter Text\n")[1].split("\n### 4. Ground Truth Events")[0].trim();
    assert.ok(this.source.length > 0);
    assert.ok(!this.source.includes("hidden_author_truth"));
    const documentId = this.id(`Document/${chapter}`);
    this.revisionId = this.id(`Revision/${chapter}`);
    await this.service.addSourceDocument(this.storyId, { id: documentId, chapter, sourceOrder: chapter, title: `Chapter ${chapter}` });
    await this.service.addSourceRevision(this.storyId, { id: this.revisionId, documentId, revisionNumber: 1, content: this.source, visibility: "canonical" });
  }
  async event(ref: string, summary: string, quotes: string[], participants: string[], payload: Event["payload"] = {}) {
    const evidenceIds: string[] = [];
    for (const quote of quotes) {
      const start = this.source.indexOf(quote);
      assert.notEqual(start, -1, `${ref}: literal quote occurs in Frozen Chapter Text`);
      const evidenceId = randomUUID();
      await this.service.addEvidence(this.storyId, { id: evidenceId, sourceRevisionId: this.revisionId, quote, start, end: start + quote.length, speakerId: null });
      evidenceIds.push(evidenceId);
    }
    const before = await this.service.getCurrentState(this.storyId);
    const event = await this.service.appendEvent(this.storyId, { sourceRevisionId: this.revisionId, sourceOrder: this.chapter, storyTime: null, eventType: ref, summary, payload, participantIds: participants.map(key => this.id(key)), evidenceIds });
    assert.deepEqual(await this.service.getCurrentState(this.storyId), before, `${ref}: Event append is inert`);
    this.events.set(ref, event);
    return event;
  }
  input(ref: string, eventRef: string, input: DeltaInput): DeltaInput {
    const event = this.events.get(eventRef)!;
    assert.ok(event, eventRef);
    return { ...input, sourceKind: "story_event", sourceEventId: event.id, effect: { id: randomUUID(), description: ref }, evidenceIds: event.evidenceIds, reason: ref, basis: input.basis === human ? basis("direct_observation") : input.basis };
  }
  async propose(ref: string, eventRef: string, input: DeltaInput) {
    const delta = await this.service.proposeDelta(this.storyId, this.input(ref, eventRef, input));
    this.deltas.set(ref, delta);
    return delta;
  }
  async admitted(ref: string, eventRef: string, input: DeltaInput) {
    const delta = await this.propose(ref, eventRef, input);
    await this.service.setValidatorResult(this.storyId, delta.id, { status: "passed", recommendation: "NEEDS_REVIEW", reason: "Manually supplied Frozen Benchmark judgment, not a runtime validator", risk: "HIGH" });
    await accept(this.service, this.storyId, delta.id);
    this.pending.push(delta.id);
    return delta;
  }
  async change(ref: string, event: string, type: TargetType, key: string, field: string, after: DeltaInput["after"], extra: Partial<DeltaInput> = {}) {
    const current = await this.row(type, key);
    const before = field === "$" ? current : (current as unknown as Record<string, DeltaInput["before"]>)[field];
    return this.admitted(ref, event, proposal(type, current.id, before, after, field, extra));
  }
  async learn(ref: string, event: string, who: string, key: keyof typeof statements, stance: CharacterKnowledgeState["stance"] = "knows", value: boolean | null = true, provenance = basis("direct_observation")) {
    const current = await this.row("knowledge", `${who}/${key}`);
    return this.change(ref, event, "knowledge", `${who}/${key}`, "$", { ...current, stance, believedValue: value, basis: provenance });
  }
  async finish() {
    const { story } = await this.service.getCurrentState(this.storyId);
    return this.service.commitAcceptedDeltas(this.storyId, { deltaIds: this.pending, expectedVersion: story.currentVersion });
  }
}

export async function chapter13(p: Pilot) {
  await p.begin(13);
  await p.event("E13-01", "林夏抵达医院急诊区", ["急诊室的灯把雨夜照得苍白。林夏推开门", "看见陈默站在走廊尽头"], ["Lin", "Chen"]);
  await p.event("E13-02", "陈默将 USB 交给林夏", ["从大衣里取出那枚银色 USB，放进她手里", "银色外壳下，藏着那艘货船最后的行踪"], ["Chen", "Lin"]);
  await p.event("E13-03", "陈默要求林夏保管 USB", ["保管好它。", "他也许并非码头的人"], ["Chen", "Lin"]);
  await p.change("D13-01", "E13-01", "characters", "Lin", "location", epistemic("Hospital"));
  await p.change("D13-02", "E13-01", "characters", "Chen", "location", epistemic("Hospital"));
  await p.change("D13-03", "E13-02", "items", "USB", "holder", epistemic(p.id("Lin")));
  await p.change("D13-04", "E13-02", "plotThreads", "USB Mystery", "status", "progressing");
  await p.learn("K13-01", "E13-02", "Lin", "handoff");
  await p.learn("K13-02", "E13-02", "Lin", "ship");
  await p.learn("K13-03", "E13-03", "Lin", "Q", "suspects", null, basis("inference"));
  await p.change("N13-06/NO_CHANGE", "E13-03", "items", "USB", "owner", epistemic(p.id("Chen")), { operation: "NO_CHANGE" });
  await p.finish();
}
export async function chapter14(p: Pilot) {
  await p.begin(14);
  await p.event("E14-01", "陈默签字离院，去向未明", ["签字离院，没留下去向"], ["Chen"]);
  await p.event("E14-02", "林夏与顾言尝试读取 USB", ["林夏始终把 USB 握在自己手里", "连续两次尝试后，文件仍然锁着"], ["Lin", "Gu"]);
  await p.event("E14-03", "何叔说明 0719 含义", ["0719 不是船号。第七码头，十九号冷库"], ["He", "Lin", "Gu"]);
  await p.event("E14-04", "何叔转达父亲的话", ["你父亲让我把这句话留给你。别信货单上的日期"], ["He", "Lin", "Gu"], { lead: "C-19", temporalClass: "reported" });
  await p.event("E14-05", "解锁目录，主体仍加密", ["界面弹出一页目录：六份货单、三段录音和一份权限日志", "只开了目录。", "里面的东西还锁着"], ["Lin", "Gu"]);
  await p.change("D14-01/02", "E14-01", "characters", "Chen", "location", epistemic(null, "Hospital"));
  await p.change("D14-03", "E14-05", "items", "USB", "condition", "index_unlocked");
  await p.change("D14-04", "E14-04", "plotThreads", "Father Thread", "status", "progressing");
  await p.change("D14-05", "E14-02", "items", "USB", "holder", epistemic(p.id("Lin")), { operation: "NO_CHANGE" });
  for (const who of ["Lin", "Gu"]) {
    await p.learn(`K14-code/${who}`, "E14-03", who, "code");
    await p.learn(`K14-report/${who}`, "E14-04", who, "RHe", "knows", true, basis("reported_claim"));
    await p.learn(`K14-directory/${who}`, "E14-05", who, "directory");
  }
  await p.finish();
}
export async function chapter15(p: Pilot) {
  await p.begin(15);
  await p.event("E15-01", "林夏与顾言进入 C-19", ["在十九号冷库门前停下", "锁舌随即弹开"], ["Lin", "Gu"]);
  await p.event("E15-02", "发现残页，林夏形成明确 belief，顾言未采纳", ["只有半张被撕开的货单", "右下角写着 `LZY`，旁边是一道反向双勾。日期栏印着三天前", "这个记号是我父亲的。", "三天前他亲自来过这里。这张残页就是他留给我的。", "还不能证明是谁把纸放进来的"], ["Lin", "Gu"]);
  await p.event("E15-03", "顾言封装后交给林夏", ["只有半张被撕开的货单", "顾言先拍下原位照片，再戴上手套把残页装进证物袋。他将封好的袋子递给林夏", "与 USB 第二层密钥提示的长度完全一致"], ["Gu", "Lin"]);
  await p.event("E15-04", "收到来自陈默号码的信息，发送者未独立核验", ["一条来自陈默号码的信息只有一句：`别走正门。货架后有维修梯。`"], ["Lin"], { senderVerified: false });
  await p.event("E15-05", "决定走维修梯，尚未到达远端地点", ["走维修梯。至于他，我还没决定信不信"], ["Lin", "Gu"], { temporalClass: "future_intent" });
  await p.change("D15-01", "E15-01", "characters", "Lin", "location", epistemic("C-19"));
  await p.change("D15-02", "E15-01", "characters", "Gu", "location", epistemic("C-19"));
  await p.admitted("D15-03/04/05", "E15-03", proposal("items", p.id("Fragment"), null, {
    id: p.id("Fragment"), active: true, name: "货单残页", owner: epistemic(null), holder: epistemic(p.id("Lin")), custodian: null, condition: "背面有疑似第二层密钥",
  }));
  await p.learn("K15-01", "E15-02", "Lin", "markings");
  await p.learn("K15-02", "E15-02", "Gu", "RMarker", "knows", true, basis("reported_claim"));
  await p.learn("K15-08", "E15-02", "Lin", "F", "believes", true, basis("inference"));
  await p.learn("K15-report-F", "E15-02", "Gu", "RF", "knows", true, basis("reported_claim"));
  for (const who of ["Lin", "Gu"]) {
    await p.learn(`K15-03/${who}`, "E15-03", who, "keyLength");
    await p.learn(`K15-sms/${who}`, who === "Lin" ? "E15-04" : "E15-05", who, "sms");
  }
  await p.finish();
}
export async function chapter16(p: Pilot) {
  await p.begin(16);
  await p.event("E16-01", "身份不明者进入冷库搜索", ["冷库正门便被人撞开，手电光扫过货架"], [], { identity: null });
  await p.event("E16-02", "陈默与顾言在维修梯入口会合", ["一只手从阴影里拉住顾言。陈默把食指压在唇前", "林夏已经转过弯，只能看见她手电的余光"], ["Chen", "Gu"]);
  await p.event("E16-03", "陈默只向顾言披露 P", ["市刑侦支队，陈默，警号 071306。我在港务安保里卧底", "等我们离开监控区，我亲口说"], ["Chen", "Gu"]);
  await p.event("E16-04", "顾言检查凭证", ["顾言看见徽记随角度变色，也认出证件格式", "市刑侦支队，陈默，警号 071306。我在港务安保里卧底"], ["Gu", "Chen"]);
  await p.event("E16-05", "三人进入维护隧道，尚未抵达旧泵房", ["三个人沿着维护隧道向旧泵房方向撤离", "顾言也没有转述刚才的对话"], ["Lin", "Chen", "Gu"]);
  await p.event("E16-06", "陈默承认发送短信", ["“信息是你发的？”她问。\n\n“是。”"], ["Chen", "Lin"]);
  for (const [who, ref] of [["Lin", "D16-01"], ["Gu", "D16-02"], ["Chen", "D16-03"]])
    await p.change(ref, "E16-05", "characters", who, "location", epistemic("Maintenance Tunnel"));
  await p.learn("K16-01", "E16-04", "Gu", "P", "knows", true, basis("direct_disclosure", "credential_inspection"));
  await p.learn("K16-02", "E16-04", "Gu", "credential", "knows", true, basis("credential_inspection"));
  await p.learn("K16-04", "E16-06", "Lin", "sender", "knows", true, basis("direct_disclosure"));
  await p.learn("K16-06", "E16-03", "Gu", "disclosurePlan", "knows", true, basis("direct_disclosure"));
  await p.finish();
}
export async function chapter17(p: Pilot) {
  await p.begin(17);
  await p.event("E17-arrival", "三人在旧泵房内", ["旧泵房的铁门还能从里面插上。顾言用工具柜顶住门，陈默关掉三个人的手机信号，林夏则把那台离线电脑放在生锈的控制台上"], ["Lin", "Chen", "Gu"]);
  await p.event("E17-01", "USB 第二层解密完成", ["六份货单、三段录音和权限日志全部变为可读取状态"], ["Lin", "Gu", "Chen"]);
  await p.event("E17-02", "完整组合证据确认周启明本人篡改记录", [
    "每一次删除、改号和日期回填都来自同一台专属终端 `ZQ-OFFICE-01`，该终端固定安装在周启明的独立办公室，不接受远程登录",
    "每次操作都同时通过周启明实名账户、现场人脸活体挑战和指纹动态认证",
    "审计链没有代签、密钥导出或认证失败记录",
    "终端摄像审计帧还逐次显示周启明本人坐在屏幕前完成确认",
    "唯一授权日志把这些操作绑定到只配发给他的密钥 `ZQ-MSA-01`",
    "被篡改的记录把运往十九号冷库的设备改写成了不存在的货船",
  ], ["Lin", "Gu", "Chen"]);
  await p.event("E17-03", "陈默向林夏直接披露身份", ["市刑侦支队。过去十八个月，我以码头联络人的身份进入港务安保。卧底任务的目标就是周启明", "林夏逐项看过照片、姓名和动态警徽", "我在维修梯口看过，格式和防伪都对"], ["Chen", "Lin", "Gu"]);
  await p.event("E17-04", "林夏明确声明当前撤离中的合作", ["这一次我信你。先带我们离开这里，别替我决定下一步"], ["Lin", "Chen", "Gu"]);
  await p.event("E17-05/06", "历史录音及预期北堤去向", ["今天是六月十七日", "他们会把我送去北堤中转站", "电脑右下角显示六月二十日凌晨"], ["Lin", "Gu", "Chen", "Father"], { lead: "North Embankment Transfer Station", temporalClass: "historical_report", currentLocationConfirmed: false });
  await p.event("E17-08", "父亲说明残页来源，林夏复述改判", ["我没有去过十九号冷库", "那张带反向双勾的残页，是我一个月前写好后交给何叔的；他会替我放进 C-19", "所以我错了。父亲没有在三天前来过 C-19；是何叔替他放的，日期也是回填的"], ["Lin", "Gu", "Chen", "Father"]);
  await p.event("E17-09", "独立门禁和无剪辑影像确认代放与父亲未到场", ["三天前只有何叔刷证进入储物区，并把证物袋中的残页放入柜内；父亲的身份记录、面部影像和同行痕迹均未出现", "影像时间与残页入柜时间一致", "录音、门禁和影像对上了"], ["Lin", "Gu", "Chen"]);
  await p.event("E17-07", "准备从排水通道继续撤离，尚未迁移", ["准备继续撤离"], ["Lin", "Chen", "Gu"], { temporalClass: "future_intent", destination: "Drainage Passage" });
  for (const [who, ref] of [["Lin", "D17-01"], ["Chen", "D17-02"], ["Gu", "D17-03"]])
    await p.change(ref, "E17-arrival", "characters", who, "location", epistemic("Old Pump House"));
  await p.change("D17-04", "E17-01", "items", "USB", "condition", "decrypted");
  const thread = await p.row("plotThreads", "USB Mystery");
  await p.change("D17-05/06", "E17-02", "plotThreads", "USB Mystery", "$", { ...thread, status: "resolved", resolution: usbAnswer }, {
    operation: "RESOLVE", resolutionSupport: { coreQuestion: usbQuestion, answer: usbAnswer, evidenceIds: p.events.get("E17-02")!.evidenceIds, assessment: "direct_answer" },
  });
  await p.admitted("D17-07", "E17-04", proposal("relationships", p.id("cooperation"), null, { id: p.id("cooperation"), active: true, fromCharacterId: p.id("Lin"), toCharacterId: p.id("Chen"), category: "explicit_operational", predicate: "bounded_cooperation", value: "active", scope: "current escape", basis: basis("direct_disclosure") }));
  await p.change("D17-08", "E17-04", "relationships", "trust", "value", "distrust", { operation: "NO_CHANGE" });
  await p.change("D17-09", "E17-09", "worldTruth", "World/F", "status", "confirmed_false", { basis: basis("documentary_evidence") });
  await p.learn("K17-01", "E17-03", "Lin", "P", "knows", true, basis("direct_disclosure", "credential_inspection"));
  for (const who of ["Lin", "Gu"]) await p.learn(`K17-target/${who}`, "E17-03", who, "target", "knows", true, basis("direct_disclosure"));
  for (const who of ["Lin", "Gu", "Chen"]) {
    await p.learn(`K17-04/${who}`, "E17-02", who, "tampering", "knows", true, basis("documentary_evidence"));
    await p.learn(`K17-05/${who}`, "E17-02", who, "equipment", "knows", true, basis("documentary_evidence"));
    await p.learn(`K17-06/${who}`, "E17-05/06", who, "historicalAlive");
    await p.learn(`K17-07/D17-11/${who}`, "E17-05/06", who, "RDestination", "knows", true, basis("reported_claim"));
    await p.learn(`K17-11/${who}`, "E17-08", who, "RFatherAccount", "knows", true, basis("reported_claim"));
    await p.learn(`K17-12/${who}`, "E17-09", who, "placement", "knows", true, basis("documentary_evidence"));
  }
  // One correction effect cites the independent audit plus the accessible recording/recantation.
  const correctionEvent = await p.event("E17-correction", "录音、独立审计和林夏明确改判共同支持纠正", [
    "我没有去过十九号冷库", "三天前只有何叔刷证进入储物区，并把证物袋中的残页放入柜内",
    "所以我错了。父亲没有在三天前来过 C-19；是何叔替他放的",
  ], ["Lin", "Gu", "Chen"]);
  await p.learn("K17-10", "E17-correction", "Lin", "F", "knows", false, {
    ...basis("documentary_evidence", "direct_disclosure"),
    correction: { previousStance: "believes", previousBelievedValue: true, evidenceIds: correctionEvent.evidenceIds },
  });
  await p.change("Fragment-key-verified", "E17-01", "items", "Fragment", "condition", "密钥用途已验证");
  await p.finish();
}
export const chapters = [chapter13, chapter14, chapter15, chapter16, chapter17];
export async function replay(through: number) {
  const pilot = new Pilot();
  await pilot.seed();
  for (const chapter of chapters.slice(0, through - 12)) await chapter(pilot);
  return pilot;
}
