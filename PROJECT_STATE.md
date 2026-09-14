# StoryState — Project State

- Current Stage: **Backend Foundation / Stage 2.1 — completed on main**. Stage 1.3 frontend product flow completed and frozen.
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

## 后续

Stage 1.3 产品流程已冻结；Stage 2.1 Canonical State Backend Foundation 已完成，详见 `docs/STAGE_2_1_BACKEND_FOUNDATION.md`。AI Extraction、Runtime Validator、RAG、Context Compiler、Frontend–Backend Integration、Writer Connector、MCP、Deployment 继续 planned；没有启动 Stage 2.2。
