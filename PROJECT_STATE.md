# StoryState — Project State

- Current Stage: **Frontend Product Flow / Stage 1.2**
- 定位：面向长篇／连续文本 AIGC 的 Stateful Context Infrastructure；增强已有 Writer，不是 AI Writer。
- 当前架构：标准 Next.js App Router + React + TypeScript + Tailwind CSS；浏览器 localStorage Mock，无后端／数据库／AI。
- 本次核实的 main 基线：`b5ba77d24409a232a10ac6b0c97f19e520fa1456`（2026-09-13 fetch 后未变化）。
- 已集成前端分支：`ui/stage-1-2`，提交 `ca1566ba60298e7c56a93fe8e1de7bcbac76ef50`。
- 技术集成分支：`integration/stage-1-2`；实际当前 HEAD 使用 `git rev-parse HEAD`，最终交付报告给出 merge SHA。

## 已完成的 Stage 1.2 产品流程

- Story 一级导航收敛为 Workspace / State / History，保留前端 AI 已确认的布局与视觉。
- READY Story 在 Library、Open Story 与 Current Story switch 都默认进入 Workspace；未初始化 Story 进入 setup。
- Setup 为 Sources & Story Settings；Review 为 Workspace run 内的流程节点。独立 route label map 保证两者 breadcrumb 非空，不重新加入一级导航。
- State Explorer 为 Current Truth；Hard State 为已提交的 Canonical Truth；Soft Interpretation 默认不是 Canonical Truth。
- Knowledge Boundary 明确 World Truth ≠ Character Knowledge；State 和 Context 显示同一已提交知识记录，不再写死 Suspects。
- Context Inspector 保留 Why Included；Writer Output 不直接改变 State，只有审核后的 accepted Delta 经 Commit 才进入 Current State。
- Chapter 与 State Version 分离。`story.chapter` 表示叙事快照章节；`currentStateVersion` / `version.stateVersion` 表示单独递增的前端状态版本。
- Commit 和 Restore 均生成新的 State Version。v13 / Chapter 13 恢复 v11 快照后为 v14 / Chapter 11，并保留 `restoredFromStateVersion: 11` 及全部历史。
- 旧 Stage 1.1 localStorage 按历史顺序补齐版本号，保留原章节、实体、编辑和版本记录；不通过清空浏览器状态升级。
- `StoryScreen` 仅负责查找故事、ready guard 和页面分派；页面、Context Inspector、共享知识边界拆入 `components/story/`。

## 范围边界

**Frontend Mock Contract ≠ Backend State Schema**。

这些字段、迁移及 snapshot 操作只用于前端 fixture，不定义正式 Backend State Schema。示例输出与下一轮任务仍是预置演示；没有真实 Run、解析或抽取。当前持久化不提供跨设备或并发协作能力。

Backend、Database、State Extraction、Context Compiler、LLM、RAG、Embedding、MCP、Auth、真实文件解析及真实版本服务全部保持 planned。没有新增 API routes 或后端依赖。

## Verification

`npm install`、生产 build、lint、13 项自动 tests 已通过；浏览器验证 Library → Workspace → Review → Commit → History → Restore → State，及 Setup breadcrumb、未初始化入口、刷新持久化。详见 `docs/STAGE_1_2_VERIFICATION.md`。

main 合并门槛：以上全部通过，并在 `git pull --ff-only origin main` 后再次安全合并；main 上重跑 build/lint/test 后才 push。

## 下一阶段

下一阶段单独评审正式 State Data Contract（角色知识、Canonical/Interpretation、版本与恢复语义），经用户确认后再决定后端集成范围。本轮不继续实现 Backend。
