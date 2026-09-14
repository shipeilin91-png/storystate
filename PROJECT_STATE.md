# StoryState — Project State

- Current Stage: **State Diff Review / Stage 1.3 — completed; frontend product flow frozen**
- 定位：Stateful Context Infrastructure，增强已有 Writer，不是 AI Writer。
- 本轮安全基线：`origin/main = 86ff3d3d5233b2fb3c1c944a6f9ac3205e86ff5b`，开始时 fetch 核实无变化。
- 已审核工作分支：`ui/stage-1-3-state-diff-review`，审核提交 `1a06ba4a92afba37f4524045c4ca4d0b01333d47`；Product Owner Review PASS，已通过非 squash merge 纳入 main。
- 架构：Next.js App Router / React / TypeScript / Tailwind；统一浏览器 localStorage mock，无后端连接。

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

已只读参考本机批准的 State Data Contract v0.2.1、Benchmark Pilot v0.2.2、Validator Rulebook v0.1.1；没有改写源文档。路径及 SHA-256 记录于本轮说明。

Reasoning checks 是预置展示数据，并非真实 Validator。没有新增依赖、API、SQL、Supabase、LLM、Extraction、Context Compiler、RAG、Embedding、MCP、Auth、真实文件解析、Writer 集成或部署。

State Explorer 继续使用既有 Evidence Inspector；字段级 expandable provenance 留待后续评审。不实现 Reasoning Graph / graph database / graph library / infinite canvas。

## Verification

验证命令：`npm install`、`npm run build`、`npm run lint`、`npm test`。
浏览器验收覆盖 Library → Workspace → Review → Accept/Reject → Commit → State → History → Restore、Setup、默认折叠/独立展开/键盘、刷新持久化及 Ch16/17。最终结果见 `docs/STAGE_1_3_STATE_DIFF_REVIEW.md`。

## 后续

Stage 1.3 产品流程已冻结。下一阶段需单独确认范围；目前不继续 Backend / Stage 2.1。
