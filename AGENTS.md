# StoryState

- 定位：面向长篇／连续文本 AIGC 的 Stateful Context Infrastructure。管理故事状态、上下文、变更审核与版本，增强已有 Writer。禁止将产品改成 AI Writer。
- 当前阶段：Backend Foundation / Stage 2.1 与 Contract Hardening / Stage 2.1.2 已完成并合并 main；Stage 1.3 前端产品流程已完成并冻结。标准 Next.js App Router + React + TypeScript + Tailwind CSS；浏览器 Mock 与正式后端模型分离。
- 只修改本仓库。不修改 EvalPilot，不整仓复制，不引入其业务逻辑、API、数据、脚本或部署配置。
- 修改前阅读 PROJECT_STATE.md 和 feature_list.json。保持信息密度、清晰任务导航、可访问性，以及所有页面的数据一致性。
- READY Story 默认进入 Workspace；Setup 为 Sources & Settings，Review 为 Workspace run 节点。Chapter 与 State Version 独立，Commit/Restore 均递增版本并保留历史。Frontend Mock Contract ≠ Backend State Schema。
- Review 原则：Default to state diff. Expand into reasoning. Recommendation ≠ Decision；Soft / NO_CHANGE 不进入 Canonical mutation。Frontend Review Contract ≠ Backend State Schema。禁止 Graph、无限画布和 graph library。
- Stage 1.3 与 Stage 2.1/2.1.1 均已通过 Product Owner Review 并合并 main。Canonical State Backend Foundation 已完成；后续阶段须单独确认，不得更改冻结的前端产品 IA。
- Stage 2.1.2 Contract Hardening 已通过 Product Owner 与 Codex 独立审核，非 squash 合并 main；仅包含 Validator admission gate、custodian reference validation 和独立 exact benchmark contract tests。Stage 2.1/2.1.2 completed/frozen，Stage 1.3 frozen。三份 Frozen Docs 不得修改；Exact Benchmark Contract Test 不等于 AI Extraction Evaluation。
- Stage 2.2 Runtime Validator 已在 `validator/stage-2-2-runtime` 分支实现，等待 Product Owner Review，未 merge。Deterministic Gate + bounded ValidationContext + 三个 specialist + deterministic aggregation；只写 validatorResult，不写 Decision/Canonical State。Semantic UNSUPPORTED/UNCERTAIN 转 NEEDS_REVIEW，不等于 hard REJECT。无新增 confidence；自动测试使用 fake，不代表真实模型准确率。
- 未经用户确认不扩大 scope；登录、支付、AI Extraction、RAG/pgvector、Context Compiler、Frontend–Backend Integration、Writer Connector、MCP 和 Deployment 保持 planned。Stage 2.2 remote credential blocked 时仅本地 commit，不请求 Keychain 权限，不 merge main，完成后等待 Product Owner Review。
- 验证：npm install、npm run build、npm run lint、npm test；启动 npm run dev，检查所有主要路由及桌面宽度。复杂状态流需回归测试。
- Git 收尾：检查 git status、git diff --stat、git diff，确保没有 secrets/.env/node_modules/build artifacts；提交并在 remote 可用时 push，最后确认 clean。不得冒称验证或推送成功。
- 中断保护：遇到额度、网络、无法继续或 Git 问题，停止新增功能，运行 git status 和 git diff --stat，可构建时 npm run build；尽可能提交 `chore: checkpoint StoryState Stage 2.1 backend`，remote 正常则 push。输出已完成、未完成、构建状态、SHA、续接位置。本地 Git 失败标记 GIT_BLOCKED，远程失败标记 REMOTE_BLOCKED。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
