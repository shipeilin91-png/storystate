# StoryState — Project State

- Current Stage: **StoryState MVP engineering complete / frozen on `release/final-demo`**. Stage 2.3B, Final Frontend, and Final E2E are complete; deployment and real runtime smoke are blocked only by unavailable production credentials, and main integration is held by that release gate.
- Evidence RAG V0.1: **implemented on `feat/evidence-rag-v0-1`, default OFF pending benchmark/preview acceptance**. It retrieves bounded historical context only; it does not alter Canonical State or Evidence authority.
- Stage 2.2 Runtime Validator V0.1 Specialist: **completed / merged / frozen / historical baseline**. 工程与治理验证完成；实现 `b5b88299f638415d14f4bde24813035342ea50df`、Astra 自审 `2a28ead17190d158134c7e3c015b74992579d086`、Codex 独立审核 `66703ed659e4c46b2b376c28ec0cdbfb69f8bda2` 保留于非 squash merge 历史。
- Stage 2.2.1 Architecture Experiment: **completed / valid / merged / frozen**；architecture decision **SELECT_GENERIC_VALIDATOR**。该结果回答架构取舍，不证明 Generic 已达到 unrestricted canonical mutation 所需准确率。
- Stage 2.2.2 Runtime Validator V0.2 — Generic Semantic Simplification: **completed / reviewed / merged / frozen**。生产语义路径改为单次 Generic 检查；deterministic gate、context provider、impact policy 与 human Decision 边界保持不变。
- Stage 2.3A Extraction Contract + Development Benchmark: **completed / reviewed / merged / frozen**。冻结 9 种 semantic Extraction effects、deterministic Compiler specification、14 Development cases / 14 Gold Effects 与 0 Hidden Holdout；没有 Extraction Runtime 或 provider/model execution。
- Stage 2.1.2 Contract Hardening: **completed / merged main**. Product Owner 与 Codex 独立审核 PASS；已审核分支 `hardening/stage-2-1-2-contract` 提交 `c1c84e8002bd0fecd808b282c483cda54e961384` 从 `753ca6a0cc0f7625898ae8839f8bc461788d502e` 非 squash 合并。
- 定位：Stateful Context Infrastructure，增强已有 Writer，不是 AI Writer。
- Stage 2.1 开发基线：`c54adce496851bc30c254201b9a7a5d8d19f5b1d`；已审核分支 `backend/stage-2-1` 的最终提交 `3c438cedfe66ee58dda12997a7c2a975d0d30533` 已非 squash 合并至 main。
- 已审核工作分支：`ui/stage-1-3-state-diff-review`，审核提交 `1a06ba4a92afba37f4524045c4ca4d0b01333d47`；Product Owner Review PASS，已通过非 squash merge 纳入 main。
- 架构：Next.js App Router / React / TypeScript / Tailwind；正式产品路径通过隔离的 frontend adapter 接入 TypeScript State Service / PostgreSQL repository，fixture-only Mock 不在映射 Story 的生产 mutation 路径中。

## 已完成

- **Default to state diff. Expand into reasoning.** Review 默认按类别显示 Before → After，推荐、风险与用户 Decision 分列。
- 原生 details/summary 逐条独立展开 Evidence、Why、关键 checks、risk、recommendation 与 reason；支持鼠标、键盘、多条展开。
- 一级导航保持 Workspace / State / History；READY → Workspace，未初始化 → Setup；Setup/Review breadcrumb 保留。
- Ch13：holder 陈默 → 林夏；owner 候选拒绝；心理信任为 Soft only；P 的身份知情不由 Q 的 suspects 推导。
- Ch16：顾言对 P unaware → knows，需人工审核；林夏对 P unaware、对 Q suspects 保持。
- Ch17：World Truth unresolved → confirmed_false；林夏 stance believes → knows、believed_value true → false 成对检查/提交；correction 为 provenance。
- Ch17：bounded cooperation active/current escape；长期 trust 仍 distrust，拒绝升级候选。
- 推荐不自动形成 Decision。只有通过 gate 的 accepted mutation 可 Commit；Rejected、Soft、NO_CHANGE 不改变 Canonical State，NO_CHANGE-only 不递增版本。
- Chapter 与 State Version 独立。Commit/Restore +1，Restore 保留旧历史、来源版本与章节快照。
- 新版本保存 reviewedChanges；History 修正旧 owner/holder 混用，缺失 holder 的历史显示“未单独记录”。
- Ch13/16/17 作为独立示例故事持久化，不替换已有故事；旧缓存 owner 候选获得纠正后的 gate，已提交快照、历史、用户决定原样保留。

## Contract 与范围

**Frontend Mock Contract ≠ Backend State Schema**。
**Frontend Review Contract ≠ Backend State Schema**。

State Data Contract v0.2.1、Benchmark Pilot v0.2.2、Validator Rulebook v0.1.1 已从本机原文复制到 `docs/`，未改写。

Stage 1.3 Reasoning checks 仍是预置展示数据。Stage 2.1 提供独立的 typed backend domain、SQL migration、repository、service、API 与 benchmark contract tests。Stage 2.3B 增加一次 Extractor 调用、冻结 ExtractionProposal 解析、deterministic Compiler、逐候选 Runtime Validator V0.2 及 Review hydration。Evidence RAG V0.1 在 Extractor 前提供同 Story、历史、限时的上下文；确定性 hashed n-gram vectorizer 不是 neural embedding，RAG 文本不是当前 Evidence 或 Canonical State。

State Explorer 继续使用既有 Evidence Inspector；字段级 expandable provenance 留待后续评审。不实现 Reasoning Graph / graph database / graph library / infinite canvas。

## Verification

验证命令：`npm install`、`npm run build`、`npm run lint`、`npm test`。
浏览器验收覆盖 Library → Workspace → Review → Accept/Reject → Commit → State → History → Restore、Setup、默认折叠/独立展开/键盘、刷新持久化及 Ch16/17。最终结果见 `docs/STAGE_1_3_STATE_DIFF_REVIEW.md`。
Stage 2.1 合并后全量测试 39/39，后端测试 14/14（含 PGlite 从空库执行迁移）；Hosted Supabase 未配置，前端仍独立使用 Mock。

Stage 2.1.2 合并后 main 验证：`npm install`、build、lint 均通过；全量 98/98，backend 62/62（原有 selected 14 + hardening 48），独立 exact benchmark 11/11；原有 Stage 1.3 自动回归 25/25。PGlite 实际执行迁移；三份 Frozen Docs 未修改。测试数量含 Node parent/subtests。详见 `docs/STAGE_2_1_2_CONTRACT_HARDENING.md`。

## Stage 2.1.2 已完成

- Validator Result Admission Gate：decision-time 与 commit-time 共用规则；failed/conflict 或 REJECT/CONFLICT 不能 accepted/commit，null 保持原行为，recommendation 不代替 human decision。
- Custodian：与 owner/holder 同样检查 value / lastConfirmedValue 的 same-story active Character 引用；null 合法；Memory / PostgreSQL 行为一致。
- Exact Frozen Benchmark：独立连续 Ch13–17 Event/Effect/Delta 测试及关键 SHOULD NOT COMMIT 负例；保留原 selected backend tests。Exact Benchmark Contract Test 不等于 AI Extraction Evaluation。
- 已通过 Product Owner 与 Codex 独立审核，保留原审核提交并非 squash 合并至 main。

## 后续

Stage 1.3 产品流程与 Stage 2.1/2.1.2 已完成并冻结。Stage 2.2 Runtime Validator V0.1 Specialist 保持 completed / frozen / historical baseline。Stage 2.2.1 Benchmark + Live Architecture Experiment 已 completed / valid / merged / frozen，并记录 **SELECT_GENERIC_VALIDATOR**。Stage 2.2.2 V0.2 Generic Simplification 与 Stage 2.3A Extraction Contract + Development Benchmark 已 completed / reviewed / merged / frozen。Stage 2.3B AI Extraction + Deterministic Compiler Runtime、Final Frontend 与 Final E2E 已 **COMPLETE / FROZEN** 于 release branch。Evidence RAG V0.1 已实现但默认关闭，等待独立 A/B benchmark 与 preview 验收；不实现 GraphRAG、MCP 或新 ontology。

Stage 2.2 合并后 main 验证：install/build/lint PASS；全量 170/170、backend 62/62、原 exact benchmark 11/11、runtime validator 72/72，Stage 1.3 自动回归 25/25；PGlite 从空库执行迁移并回读 validator JSONB checks/audit。四项审核修复：pending 互斥 Delta 检测、整行/字段等价效果比较、无序行/关联 ID/对象键的稳定指纹、完整 DeltaInput（confidence/risk/proposedBy）的并发指纹。十案例 fake benchmark routing 10/10、false AUTO_ACCEPT 0/10；真实模型准确率未验证。详见 `docs/STAGE_2_2_RUNTIME_VALIDATOR.md`。不自行启动下一阶段。

## Stage 2.2.1A 已完成 / 已合并 / 已冻结

Stage 2.2.1A Benchmark + Eval Harness 已非 squash 合并 main，状态为 **COMPLETED / FROZEN**；其 lock 在 live run 前冻结并保持未变。Astra freeze 为 `ddfb19260853b441b11934420ec5bce4feab76dd`，Codex hardening 与 live run 绑定的 reviewed pre-live frozen commit 为 `fe620a3d8e36cf81d70d39c426a22783c555379a`。10 Anchor + 20 Holdout（四组各5，8 SUPPORTED / 8 UNSUPPORTED / 4 UNCERTAIN）及 lock manifest 已复核。Mock 输出仅为 HARNESS TEST ONLY，不构成模型性能结论。20 个 Holdout 是来自 Ch13–17 与已知语义边界类的预注册内部 StoryState challenge set，仅支持当前 StoryState domain 内的架构决策，不证明所有长篇 AIGC domain 的普遍优越性。Stage 2.2 frozen 不变。详见 `docs/STAGE_2_2_1_LIVE_SEMANTIC_VALIDATION.md`。

## Stage 2.2.1B0 / B0.1 Live Run Package Preparation

Stage 2.2.1B0 已准备 live-run package；B0.1 当时状态为 **DEEPSEEK PROVIDER PREPARED / PROBE NOT AUTHORIZED**。官方 provider 为 `deepseek-api`，requested model 为 `deepseek-flash`；B0.1 尚未观察 provider 返回的 model identity，故当时保持 unknown/null。Gemini 仅保留为文档备选研究，相关 runtime adapter 与依赖已移除。DeepSeek evaluation-only adapter 显式发送 `reasoning.effort=none`，拒绝 reasoning 输出或非零 reasoning tokens，并保持既有 model identity drift、parser 与冻结评测语义。

离线 preflight、未授权 manifest、synthetic probe package、结果 schemas 与 completed-run 覆盖保护均已准备；B0.1 的 probe CLI 固定返回 `DEEPSEEK_PROBE_NOT_AUTHORIZED`，live entrypoint 固定返回 `LIVE_RUN_NOT_AUTHORIZED`。测试或 preflight 不读取 `DEEPSEEK_API_KEY`；B0.1 自身真实 provider 调用为 **0**。后续单次授权 probe 的清洗后证明与当前 runner 状态见下方 B0.3；B0.1 当时 Stage 2.2.1B 尚未开始，Live Semantic Accuracy 尚未验证。

## Stage 2.2.1B0.3 DeepSeek Live Runner Freeze

一次独立授权的 non-Benchmark red-key probe 已 PASS：provider status `completed`，requested model 与 observed `response.model` 均为 `deepseek-flash`，input/output tokens 为 939/85，reasoning tokens 为 0，semantic verdict `SUPPORTED`，structured parser PASS。由于 provider 仅返回同名 alias，identity class 正式记录为 **PROVIDER_MODEL_ALIAS_ONLY**，不宣称获得不可变 backend version。该 probe 只验证 connectivity、non-thinking request、structured output 与 usage mapping，不验证准确率或架构质量。

B0.3 已准备 fail-closed official runner 与 execution provenance：prepared manifest 仍为 `PREPARED_NOT_AUTHORIZED`；授权 manifest 必须绑定 exact live-run code SHA，且 runner 在读取 key 前检查 clean worktree、冻结 dataset/config、198-call routing、DeepSeek alias-only identity 与单次连续执行约束。B0.3 当时 provider calls=0，历史 synthetic probe calls=1，benchmark calls=0。后续正式实验结果见下节。

## Stage 2.2.1B Live Semantic Architecture Experiment

Stage 2.2.1B 官方 run 已 **COMPLETED / VALID / MERGED / FROZEN**，通过非 squash merge commit `42aee56acded28efdc15a2bd27bca6a59c352921` 保留完整准备、probe、freeze 与 finalization 历史：198/198 calls，0 failures；总 usage 为 353,591 input tokens / 25,005 output tokens。provider/requested/observed identity 为 `deepseek-api` / `deepseek-flash` / `deepseek-flash`，identity class 为 `PROVIDER_MODEL_ALIAS_ONLY`。

20-case Holdout 是主要证据。Generic 与 Specialist semantic accuracy 均为 12/20，False AUTO 均为 0/15，Safe AUTO 均为 4/5，Review Rate 均为 16/20。Generic stability 为 10/10，Specialist 为 9/10；Specialist 平均 calls 为 2.15 对 Generic 1.0，mean/median latency 约为两倍，P95 约为 2.9 倍。依预注册 simplification rule，Architecture Decision 为 **SELECT_GENERIC_VALIDATOR**。

这一结果仅证明 Specialist decomposition 未提供足以抵偿复杂度的增量价值。12/20 不足以宣称 Generic semantic performance 强，也不授权扩大 AUTO acceptance。deterministic gate、conservative routing、high-impact review、human review 与 no direct LLM mutation 继续保留。Stage 2.2 V0.1 Specialist 仍是冻结历史基线；Stage 2.2.2 Runtime Validator V0.2 Generic Semantic Simplification 已 **COMPLETED / REVIEWED / MERGED / FROZEN**。Sanitized artifacts 见 `docs/evaluation/stage-2.2.1b/`；raw provider results 保持本地 Git-ignored。

## Stage 2.2.2 已完成 / 已审核 / 已合并 / 已冻结

生产 Runtime Validator V0.2 对每个 deterministic gate 通过且 context 可用的候选只发出一次 Generic semantic request，使用与 Stage 2.2.1B eval 完全相同的冻结 prompt 与严格 Generic schema。非 `SUPPORTED`、provider/parse/timeout failure、context unavailable、retrieval truncated 与既有 high-impact policy 均保持 `NEEDS_REVIEW`；deterministic failed/conflict 继续分别为 `REJECT` / `CONFLICT` 且零 semantic calls。V0.1 Specialist checks 继续可由 domain schema、Memory/PostgreSQL repository 与 API 读取，无需 migration；历史 Specialist eval runner 保留。详见 `docs/STAGE_2_2_2_GENERIC_VALIDATOR.md`。

Stage 2.2.2 合并后 main 验证：install/build/lint PASS；全量 270/270、backend 62/62、exact benchmark 11/11、runtime validator 71/71、validator-v0-2 13/13、evaluation 51/51、live-prep 37/37。生产路径对 eligible validation 恰好一次 Generic semantic call，deterministic gate、impact policy、human Decision、V0.1 Specialist ValidatorResult 兼容与 historical Specialist evaluation 均保留。独立审核发现部分 high-impact full-runtime 类别存在非阻塞测试覆盖缺口；独立 probe 未发现生产缺陷。

## Stage 2.3A 已完成 / 已审核 / 已合并 / 已冻结

Stage 2.3A 冻结 model-facing `ExtractionProposal` contract、9 种 semantic effect、declarative deterministic Compiler specification、deterministic Gold / Forbidden matching、proposal 与 compiled 分层 metrics、14-case / 14-Gold Development benchmark，以及只含分布与 authoring protocol 的 Holdout blueprint。Hidden Holdout cases 为 0；`extractorConfigHash` 未定义。

冻结 hashes：`extractionContractHash=fdb10c9c9e9c9ee80ac2efa70c267a2399209ac8c3d5c3d4cabc084d332704f4`；`compilerSpecHash=e4b182663f3d8a87075bb0bdb96cb28d864d0089fda6a00488bb305a269f7202`；`developmentDatasetHash=d9e9dd16b13edc1428e23a80c2ca0a32fef43e6a4c1886a62717808815063dfe`；`holdoutBlueprintHash=35baeb1ddd87bf122b9f9f649ff8dab5364e29a272722bba74154b5ed35f00f6`。

Stage 2.3A 合并后 main 验证：install/build/lint PASS；全量 299/299、backend 62/62、exact benchmark 11/11、runtime validator 71/71、validator-v0-2 13/13、evaluation 51/51、live-prep 37/37、extraction-contract 9/9、extraction-eval 20/20。Provider/model calls 为 0。本阶段冻结 evaluation method 与 Development benchmark，没有实现 Extraction Runtime、真实 persistence Compiler 或 ExtractionService，也没有测量 live model extraction quality；0.85/0.70 preregistered threshold 未被宣称达成。

## Stage 2.3B + Final E2E Integration

Stage 2.3B 聚焦复审确认三个原 P1 blocker 均已关闭：validator post-persistence failure 逐候选隔离；item holder/owner/custodian reference 编译为 Canonical ID 结构；model-visible packet 使用 opaque aliases 且不泄露 UUID。Malformed JSON 与 schema-invalid output 均 fail closed 为 `EXTRACTION_OUTPUT_INVALID`。Stage 2.3A 四项冻结 hash 与 0 Hidden Holdout 保持不变。

`integration/final-e2e` 保留 backend 与 frozen frontend 两边历史，完成 Workspace → Source Document/Revision → Extract → hydrated Review → Accept/Reject → Commit → State/History reload。Rejected delta 只保留为 audit data，不返回 active Review；`VALIDATOR_UNAVAILABLE` 保持 Needs Review 并在 UI 安全提示；409 mutation 不自动 retry；映射 Story 使用 API adapter，不降级到 localStorage/mock mutation。自动测试使用 deterministic fake provider，本次 provider/model calls 为 0。

## Final MVP Release

Stage 2.3B、Final Frontend 和 Final E2E 已 **COMPLETE / FROZEN**，MVP engineering status 为 **COMPLETE**。最终架构见 `docs/FINAL_ARCHITECTURE.md`；README 已重写为 portfolio-facing product summary。Release verification：install、build、lint PASS；全量 331/331；backend 62/62；validator-v0-2 13/13；extraction contract/eval/runtime/API 分别 9/9、20/20、10/10、9/9。Release 环境未提供 `STORYSTATE_DATABASE_URL`、Extractor/Validator provider variables 或 Vercel authentication，因此 migration、deterministic seed、deployment 与 real runtime smoke 未执行，状态为 **TECHNICALLY_COMPLETE / DEPLOYMENT_ENV_BLOCKED**。自动验证不产生 external provider calls；未凭空创建凭据，也未将历史 `DEEPSEEK_API_KEY` 当作生产 contract。由于真实 smoke 是 main release gate，main integration 保持 held。
