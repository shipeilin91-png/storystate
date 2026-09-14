# StoryState

当前阶段：State Diff Review / Stage 1.3，已通过 Product Owner Review；前端产品流程已冻结。

面向长篇／连续文本 AIGC 的 Stateful Context Infrastructure。为已有 Writer 提供状态工作台：查看事实与知识边界、检查上下文、审核变化和追溯版本。

## 本地运行

Node.js 22+（本轮验证环境：24.18.0）。

```bash
npm install
npm run dev
```

打开 http://localhost:3000 。Next.js 开发服务绑定本机回环地址。

```bash
npm run build
npm run lint
npm test
```

## 前端范围

标准 Next.js App Router、React、TypeScript、Tailwind CSS；不需要环境变量或第三方服务。

- `/`：故事库、搜索、筛选、新建故事。
- `/stories/fog-harbor/setup`：资料导入与初始状态的预置模拟。
- `/stories/fog-harbor/state`：六类实体列表及证据检查器。
- `/stories/fog-harbor/workspace`：任务编辑与六类上下文检查；固定 Writer 示例不响应 Prompt 生成。
- `/stories/fog-harbor/review`：接受、修订、拒绝；冲突需修订或拒绝；模拟提交才更新状态。
- `/stories/fog-harbor/history`：状态快照、变更记录和模拟恢复确认。

统一数据位于 `lib/mock-story.ts`；浏览器状态由 `components/story-provider.tsx` 管理，保存在当前 origin 的 localStorage 键 `storystate.foundation.v1`。刷新会保留更改；不同浏览器、设备、端口及 localhost/127.0.0.1 之间不共享。浏览器不允许存储时降级为内存并展示提示。

《雾港》预置第 12 章后的状态及第 13 章的精选候选变化（含 Soft Interpretation）。新建故事为空，载入三个《雾港》示例资料后才可模拟初始化。模拟提交／恢复没有后端、审计保障或多人并发能力。示例流程处理完后不自动生成下一轮变化。

若需从头验收，可使用新的浏览器站点会话，或通过开发者工具清除此站点的上述存储键（会丢失该浏览器的 Mock 编辑）。

## 继续开发

先读 `AGENTS.md`、`PROJECT_STATE.md`、`feature_list.json`，再参考 `docs/REUSE_AUDIT.md` 与 `docs/VERIFICATION.md`。未确认前不实现后端／AI 或扩大本阶段范围。

## Stage 1.2 integration

READY Story 默认进入 Workspace；Story 一级导航为 Workspace / State / History。Sources & settings 为次级入口，Review 为 Workspace run 内流程节点。

Frontend Mock Contract ≠ Backend State Schema。`currentStateVersion` 与 `Version.stateVersion` 独立于 `chapter`。Commit/Restore 都使状态版本 +1；Restore 保留原历史，以新的版本记录旧章节快照及来源版本。旧 localStorage 内容自动补齐状态版本号，保留已有编辑。

页面实现已拆分至 `components/story/`；`lib/story-navigation.ts` 统一默认入口，`lib/story-store.ts` 负责前端缓存兼容和按故事更新。验收记录见 `docs/STAGE_1_2_VERIFICATION.md`。

## Stage 1.3 — State Diff Review

Default to state diff. Expand into reasoning.

Review 先展示 Category / Field / Before → After / Recommendation / User Decision；每行“查看原因”独立展开证据、示例检查与推荐理由。推荐不自动接受或提交。Ch13 区分 holder / owner / Soft；Ch16 区分角色对 P / Q 的知识；Ch17 展示信念更正与有界合作。

独立示例入口：`/stories/review-ch13/review`、`/stories/review-ch16/review`、`/stories/review-ch17/review`。示例故事也出现在 Library；首次补充到本地缓存，之后保留各自编辑。它们是精选变化，不是完整章节抽取。

旧故事已提交数据原样保留；旧 USB owner 交接候选获得拒绝 gate，不自动修正历史。Soft / NO_CHANGE 不写入状态，NO_CHANGE-only 不产生版本。`Version.reviewedChanges` 保留本次审核与 correction provenance；History 分开显示 USB owner 和 holder。

Frontend Review Contract ≠ Backend State Schema。无后端、Database、AI、运行时 Validator 或 Graph。产品边界与验收见 `docs/STAGE_1_3_STATE_DIFF_REVIEW.md`。Stage 1.3 已审核通过并合并 main；后续阶段需另行确认。

## Stage 2.1 — Backend Foundation（本分支进行中）

`backend/stage-2-1` 增加独立的 TypeScript typed State Service、Supabase PostgreSQL 迁移及后端 API；现有 Stage 1.3 页面仍读本地 Mock，尚未连接后端。未配置 `STORYSTATE_DATABASE_URL` 时 API 返回 503，前端、构建和测试仍可运行。使用 `npm run test:backend` 验证冻结 Ch13–17 Benchmark、治理流程和 PostgreSQL 迁移。架构、接口、事务与部署边界见 `docs/STAGE_2_1_BACKEND_FOUNDATION.md`。本阶段不实施 AI Extraction、完整 Runtime Validator 或部署，不合并 main。
