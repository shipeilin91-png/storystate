# StoryState — Project State

- Current Stage: **Stage 1.3、Stage 2.1、Stage 2.1.2、Stage 2.2 — completed / frozen on main**.
- Stage 2.2 Runtime Validator V0.1: **completed / merged / frozen**. 工程与治理验证完成；LIVE SEMANTIC MODEL ACCURACY NOT YET VALIDATED。实现 `b5b88299f638415d14f4bde24813035342ea50df`、Astra 自审 `2a28ead17190d158134c7e3c015b74992579d086`、Codex 独立审核 `66703ed659e4c46b2b376c28ec0cdbfb69f8bda2` 保留于非 squash merge 历史。
- Stage 2.1.2 Contract Hardening: **completed / merged main**. Product Owner 与 Codex 独立审核 PASS；已审核分支 `hardening/stage-2-1-2-contract` 提交 `c1c84e8002bd0fecd808b282c483cda54e961384` 从 `753ca6a0cc0f7625898ae8839f8bc461788d502e` 非 squash 合并。
- 定位：Stateful Context Infrastructure，增强已有 Writer，不是 AI Writer。
- Stage 2.1 开发基线：`c54adce496851bc30c254201b9a7a5d8d19f5b1d`；已审核分支 `backend/stage-2-1` 的最终提交 `3c438cedfe66ee58dda12997a7c2a975d0d30533` 已非 squash 合并至 main。
- 已审核工作分支：`ui/stage-1-3-state-diff-review`，审核提交 `1a06ba4a92afba37f4524045c4ca4d0b01333d47`；Product Owner Review PASS，已通过非 squash merge 纳入 main。
- 架构：Next.js App Router / React / TypeScript / Tailwind；冻结的浏览器 localStorage Mock 与独立 TypeScript State Service / Supabase PostgreSQL schema 分离。前端尚未接后端。

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

Stage 1.3 Reasoning checks 仍是预置展示数据。Stage 2.1 提供独立的 typed backend domain、SQL migration、repository、service、API 与 benchmark contract tests；没有 AI extraction、完整 Runtime Validator、Context Compiler、RAG、Embedding、MCP、Auth、真实文件解析、Writer 集成或部署。

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

Stage 1.3 产品流程与 Stage 2.1/2.1.2/2.2 均已完成并冻结。Stage 2.2 Runtime Validator V0.1 复用治理逻辑的 deterministic gate、有界结构检索、Evidence / Knowledge Boundary / Temporal 三个 specialist、确定性聚合、结果持久化与最小 validate API。只写 validatorResult，recommendation 不代替 human decision。Live Semantic Validation、AI Extraction、RAG/pgvector、Context Compiler、Frontend–Backend Integration、Writer Connector、MCP、Deployment 仍 planned。

Stage 2.2 合并后 main 验证：install/build/lint PASS；全量 170/170、backend 62/62、原 exact benchmark 11/11、runtime validator 72/72，Stage 1.3 自动回归 25/25；PGlite 从空库执行迁移并回读 validator JSONB checks/audit。四项审核修复：pending 互斥 Delta 检测、整行/字段等价效果比较、无序行/关联 ID/对象键的稳定指纹、完整 DeltaInput（confidence/risk/proposedBy）的并发指纹。十案例 fake benchmark routing 10/10、false AUTO_ACCEPT 0/10；真实模型准确率未验证。详见 `docs/STAGE_2_2_RUNTIME_VALIDATOR.md`。不自行启动下一阶段。

## Stage 2.2.1A 分支准备

`eval/stage-2-2-1-live-semantic` 已准备 benchmark freeze 与 evaluation harness，等待审核；**NOT live-run，Stage 2.2.1 NOT complete，不是性能结果冻结**。10 Anchor + 20 Holdout（四组各5，8 SUPPORTED / 8 UNSUPPORTED / 4 UNCERTAIN），20个Holdout均通过冻结gate；H09仅比较有界/无界operational cooperation，H17比较Ch16方向与Ch17实际抵达。四组ablation含精确证据ID审计。Generic一次调用与生产specialist路由使用同一packet/模型配置；统计独立报告Anchor/Holdout，支持安全指标、calls、latency、可选usage/cost和预选stability。真实provider调用为0；Stage 2.2 frozen不变。详见 `docs/STAGE_2_2_1_LIVE_SEMANTIC_VALIDATION.md`。
