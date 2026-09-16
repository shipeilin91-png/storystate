# StoryState

- 定位：面向长篇／连续文本 AIGC 的 Stateful Context Infrastructure。管理故事状态、上下文、变更审核与版本，增强已有 Writer。禁止将产品改成 AI Writer。
- 当前阶段：Stage 1.3、Stage 2.1、Stage 2.1.2 已完成并冻结；Stage 2.2 Runtime Validator V0.1 Specialist 已完成、合并 main 并冻结为历史基线；Stage 2.2.2 Runtime Validator V0.2 Generic Simplification 已在 feature branch 实现，等待 Product Owner Review。标准 Next.js App Router + React + TypeScript + Tailwind CSS；浏览器 Mock 与正式后端模型分离。
- 只修改本仓库。不修改 EvalPilot，不整仓复制，不引入其业务逻辑、API、数据、脚本或部署配置。
- 修改前阅读 PROJECT_STATE.md 和 feature_list.json。保持信息密度、清晰任务导航、可访问性，以及所有页面的数据一致性。
- READY Story 默认进入 Workspace；Setup 为 Sources & Settings，Review 为 Workspace run 节点。Chapter 与 State Version 独立，Commit/Restore 均递增版本并保留历史。Frontend Mock Contract ≠ Backend State Schema。
- Review 原则：Default to state diff. Expand into reasoning. Recommendation ≠ Decision；Soft / NO_CHANGE 不进入 Canonical mutation。Frontend Review Contract ≠ Backend State Schema。禁止 Graph、无限画布和 graph library。
- Stage 1.3 与 Stage 2.1/2.1.1 均已通过 Product Owner Review 并合并 main。Canonical State Backend Foundation 已完成；后续阶段须单独确认，不得更改冻结的前端产品 IA。
- Stage 2.1.2 Contract Hardening 已通过 Product Owner 与 Codex 独立审核，非 squash 合并 main；仅包含 Validator admission gate、custodian reference validation 和独立 exact benchmark contract tests。Stage 2.1/2.1.2 completed/frozen，Stage 1.3 frozen。三份 Frozen Docs 不得修改；Exact Benchmark Contract Test 不等于 AI Extraction Evaluation。
- Stage 2.2 Runtime Validator V0.1 Specialist 工程与治理验证完成并冻结为历史基线。实现 `b5b88299f638415d14f4bde24813035342ea50df`、Astra 自审修复 `2a28ead17190d158134c7e3c015b74992579d086`、Codex 独立审核修复 `66703ed659e4c46b2b376c28ec0cdbfb69f8bda2` 均保留于非 squash merge 历史。只写 validatorResult，不写 Decision/Canonical State；Semantic UNSUPPORTED/UNCERTAIN 转 NEEDS_REVIEW。
- Stage 2.2.1A Benchmark + Eval Harness 已完成、合并 main 并冻结；Astra freeze `ddfb19260853b441b11934420ec5bce4feab76dd`、Codex hardening/reviewed pre-live freeze `fe620a3d8e36cf81d70d39c426a22783c555379a`。10 Anchor + 20 eligible Holdout，Gold/packet/config 锁定于 `stage-2.2.1/v0.1`；mock 输出仅为 HARNESS TEST ONLY。
- Stage 2.2.1B0.3 已基于一次成功 synthetic probe 冻结 DeepSeek live-run identity/provenance：requested 与 observed provider model 均为 `deepseek-flash`，identity class 为 `PROVIDER_MODEL_ALIAS_ONLY`，不得称为不可变 backend version。B0.3 当时 historical probe calls=1、benchmark calls=0；prepared manifest 与默认 live CLI 继续 fail closed。后续授权 run 必须单次连续执行、clean worktree、精确 code SHA 和 model-drift guard。
- Stage 2.2.1B live semantic architecture experiment 已完成、有效并非 squash 合并 main：198/198 calls、0 failures；Holdout Generic 与 Specialist 均 12/20，False AUTO 均 0/15，Safe AUTO 均 4/5；Generic/Specialist stability 为 10/10 与 9/10。Architecture Decision 为 `SELECT_GENERIC_VALIDATOR`；12/20 不证明 unrestricted semantic sufficiency，不扩大 AUTO acceptance。Stage 2.2 V0.1 Specialist 保持 completed/frozen/historical baseline；Stage 2.2.2 Generic Simplification 已在 feature branch 实现，等待 Product Owner Review，尚未合并或冻结。
- Stage 2.2.2 V0.2 生产语义路径为 deterministic gate → bounded context → exactly one Generic semantic check → unchanged deterministic impact/routing → human Decision。冻结 Generic prompt 与 eval 共用；historical Specialist schemas、routing、parser、orchestrator 与 evaluation 保留；V0.1 Specialist ValidatorResult 继续兼容。
- 未经用户确认不扩大 scope；登录、支付、AI Extraction、RAG/pgvector、Context Compiler、Frontend–Backend Integration、Writer Connector、MCP 与 Deployment 保持 planned。
- 验证：npm install、npm run build、npm run lint、npm test；启动 npm run dev，检查所有主要路由及桌面宽度。复杂状态流需回归测试。
- Git 收尾：检查 git status、git diff --stat、git diff，确保没有 secrets/.env/node_modules/build artifacts；提交并在 remote 可用时 push，最后确认 clean。不得冒称验证或推送成功。
- 中断保护：遇到额度、网络、无法继续或 Git 问题，停止新增功能，运行 git status 和 git diff --stat，可构建时 npm run build；尽可能提交 `chore: checkpoint StoryState Stage 2.1 backend`，remote 正常则 push。输出已完成、未完成、构建状态、SHA、续接位置。本地 Git 失败标记 GIT_BLOCKED，远程失败标记 REMOTE_BLOCKED。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
