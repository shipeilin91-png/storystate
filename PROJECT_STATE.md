# StoryState — Project State

- Current Stage: **Frontend Foundation / Stage 1.1**
- 定位：面向长篇／连续文本 AIGC 的 Stateful Context Infrastructure；不是 AI Writer。
- 架构：干净 Next.js App Router + React + TypeScript + Tailwind CSS。仅客户端 Mock 状态；无 API routes、数据库、真实 AI、部署适配器或环境变量。
- Source reference: EvalPilot `2191650de6896295f12bacf4dc3226ea0eaf56a5`，只读审计与少量通用 UI pattern 复用。见 `docs/REUSE_AUDIT.md`。

## 本轮完成

六个产品页面；共享导航与品牌；统一《雾港》人物／知识／关系／道具／线索／事件数据；本地新建与资料模拟初始化；状态与上下文 inspector；Accept/Edit/Reject、冲突处理、模拟提交与版本快照；模拟恢复与确认；浏览器刷新持久化；空态、未找到故事与无效路由处理。

## 未完成（有意保持 planned）

真实文件解析、State Extraction、Context Compiler、Writer/LLM 集成、真实 Commit/Rollback、数据库、账户和协作。未实现生产部署。本轮没有把这些功能冒称完成。

## 验证

见 `docs/VERIFICATION.md`。生产构建、lint、状态流测试以及桌面浏览器验收为交付门槛。

## 下一阶段

先评审产品信息架构、知识边界语义、状态及 Delta 数据契约；经用户确认后再确定最小真实状态流程，不直接开始后端开发。

## 当前 HEAD

本文件与 Stage 1.1 foundation 提交一起版本化。**当前 HEAD 的权威值为 `git rev-parse HEAD`**；不在同一提交内硬编码其自身 SHA（Git 提交哈希包含本文件，无法自引用）。最终交付报告给出完整 SHA。当前交付分支：`main`。

## Git 收尾记录

- 已验证的前端代码 checkpoint：`3d77fa8631b4d66ea95400ab90df543c2c8bdc7c`。
- 首次提交缺少作者身份，已按中断保护停止功能修改、重新构建并保存 checkpoint。
- 仅本仓库使用已认证 GitHub 账户 `shipeilin91-png` 及其 noreply 地址；未更改全局 Git 配置。
- Stage 1.1 本地验收已完成：build、lint、6 项 tests、六个 dev routes、桌面交互均通过。本阶段无剩余功能开发。
- 最终 foundation 提交封存此交付记录；后续请从 `git rev-parse HEAD` 读取实际 HEAD，并先评审下一阶段契约。
