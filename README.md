# StoryState

当前阶段：Frontend Product Flow / Stage 1.2。

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

《雾港》预置第 12 章后的状态及第 13 章的四条 Proposed Delta。新建故事为空，载入三个《雾港》示例资料后才可模拟初始化。模拟提交／恢复没有后端、审计保障或多人并发能力。示例流程处理完后不自动生成下一轮变化。

若需从头验收，可使用新的浏览器站点会话，或通过开发者工具清除此站点的上述存储键（会丢失该浏览器的 Mock 编辑）。

## 继续开发

先读 `AGENTS.md`、`PROJECT_STATE.md`、`feature_list.json`，再参考 `docs/REUSE_AUDIT.md` 与 `docs/VERIFICATION.md`。未确认前不实现后端／AI 或扩大本阶段范围。

## Stage 1.2 integration

READY Story 默认进入 Workspace；Story 一级导航为 Workspace / State / History。Sources & settings 为次级入口，Review 为 Workspace run 内流程节点。

Frontend Mock Contract ≠ Backend State Schema。`currentStateVersion` 与 `Version.stateVersion` 独立于 `chapter`。Commit/Restore 都使状态版本 +1；Restore 保留原历史，以新的版本记录旧章节快照及来源版本。旧 localStorage 内容自动补齐状态版本号，保留已有编辑。

页面实现已拆分至 `components/story/`；`lib/story-navigation.ts` 统一默认入口，`lib/story-store.ts` 负责前端缓存兼容和按故事更新。验收记录见 `docs/STAGE_1_2_VERIFICATION.md`。
