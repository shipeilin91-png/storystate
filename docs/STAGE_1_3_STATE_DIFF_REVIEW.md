# Stage 1.3 — State Diff + Expandable Reasoning Review

## 产品原则

**Default to state diff. Expand into reasoning.**

用户审核一轮输出，首先需要知道谁/什么从哪个状态变到哪个状态，以及哪些变化值得接受。Before → After 比 Graph 更直接地支持比较和决策，不要求用户先理解节点、边或浏览画布。本阶段不实现 Reasoning Graph、无限画布、思维导图或图数据库。

证据、Validator checks 和原因采用 progressive disclosure：每行原生 details/summary 默认关闭，需要时展开。多个 change 可独立展开；鼠标、Enter/Space 都可操作；不会打开 modal，也不自动滚动页面。比较使用文字、箭头和 badge，不依赖红绿颜色。桌面首屏优先呈现本示例的关键变化，提交栏不覆盖内容。

## 边界与展示类型

- Recommendation ≠ Decision：AUTO_ACCEPT_ELIGIBLE / NEEDS_REVIEW / REJECT / CONFLICT 为前端推荐。Pending / Accepted / Rejected 为用户决定。推荐不自动接受，接受不自动提交。
- Event ≠ State：事件只用于 source context，Review 按 Characters / Items / Plot Threads / Knowledge / Relationships 分组。
- Soft Interpretation ≠ Canonical State：单独标记 Soft only，不提供 canonical Accept，不参与提交。
- NO_CHANGE 是审核说明，不是 mutation；单独此类条目不产生新版本。
- Frontend Review Contract ≠ Backend State Schema；Frontend Mock Contract ≠ Backend State Schema。
- checks/recommendations 是人工整理的 fixture 展示，不是新建运行时 Validator，不运行 AI。

`lib/review-contract.ts` 定义 ReasoningDetail、ValidationCheck、Recommendation、ReviewRisk，集中处理展示与本地 gate。`StateDiffRow` 负责比较/决定/展开，`ReasoningDetail` 负责第二层内容，`DeltaReview` 负责分组、筛选和 Commit。没有引入新依赖或抽象图结构。

## 示例映射

| 示例                | Diff 与建议                                                            | Commit 后                                |
| ------------------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| Ch13 holder         | 陈默 → 林夏；LOW / AUTO_ACCEPT_ELIGIBLE                                | holder 林夏                              |
| Ch13 owner          | 陈默 → 林夏候选；HIGH / REJECT                                         | owner 陈默                               |
| Ch13 interpretation | 接受 USB / 没有追问 → 可能信任；Soft only                              | 不改 trust                               |
| Ch16 顾言/P         | unaware → knows；HIGH / NEEDS_REVIEW；直接披露 + credential inspection | 仅顾言更新                               |
| Ch16 林夏/P、Q      | P unaware → unaware，Q suspects → suspects                             | 不交叉传播                               |
| Ch17 World Truth    | unresolved → confirmed_false；录音 + 门禁 + 无剪辑影像                 | 单独世界命题更新                         |
| Ch17 林夏 belief    | believes(true) → knows(false)                                          | 成对字段更新；保留 correction provenance |
| Ch17 relationship   | none → active/current escape；distrust → trust 候选拒绝                | 有界合作成立，长期 distrust 保留         |

示例是精选审核窗口，不是完整章节的抽取或重放。`review-ch13`、`review-ch16`、`review-ch17` 为独立 Story，可从 Library 或 Review 的示例链接进入，持久化并隔离各自数据。点击示例链接不会覆盖当前故事。

## Commit、Restore 与缓存兼容

- 仅 accepted、before 匹配且未被 gate 拒绝的 canonical mutation 可提交。冲突未解决阻止相关批次；本轮对证据不足候选保留 Reject 路径，不提供任意字符串编辑来绕过 gate。
- `additionalFields` 是前端成组变化表示，Ch17 同时校验 stance 与 believed_value；任一 stale 都阻止整个 batch。重叠 target/field 防止同批重复覆盖。
- 只含 NO_CHANGE/Soft 时不新建版本；混合批次只 apply 实际 accepted mutation。
- Version 保存 `reviewedChanges` 副本（含未接受候选与 correction transition），旧 snapshot 不可变。它是 fixture audit，不是正式后端 ledger。
- Restore 沿用 Stage 1.2：新建 state version、保留全部历史、恢复旧章节快照，不回退 version counter。
- 旧 localStorage key 保留。旧 owner 候选若只有“放进她手里”的证据，追加 REJECT 展示/gate；不修改已经提交的 owner、章节、历史或用户 Decision。用户可以 Reject 该候选，或使用独立 Ch13 示例。
- 缺失的示例只补充一次；之后不替换同 ID 故事。未知/坏格式缓存保留既有安全降级行为。
- History 将 USB owner 和 holder 分列；旧快照未记录 holder 时显示“未单独记录”，不拿 owner 冒充 holder。

## State provenance

不扩展 State Explorer 交互，保留既有 Evidence Inspector。字段级 expandable provenance 和可见的逐字段审核链留待后续单独评审。版本中的 reviewedChanges 已提供前端记录基础。

## 只读参考来源

三个源文件均已找到并只读使用，未改写 Contract、Benchmark 或 Rulebook：

| 文件                                     | 本机位置              | SHA-256                                                            |
| ---------------------------------------- | --------------------- | ------------------------------------------------------------------ |
| STORYSTATE_STATE_DATA_CONTRACT_V0.2.1.md | `~/Downloads/`        | `9fbe57bad6362122f70b747ccd73dfc6775b90b3daa6bb3250d6474d9227628d` |
| STORYSTATE_BENCHMARK_PILOT_V0.2.2.md     | `~/Downloads/ai项目/` | `a8468d2d68b2c20a42ff0721d5d34501cca14b4e172b173ef6194c94e0ba064a` |
| STORYSTATE_VALIDATOR_RULEBOOK_V0.1.1.md  | `~/Downloads/`        | `c115dd27d436bebab7c76945e0cd8fe7ab5ead1e164ab3be163fa17b50a654cb` |

本分支无需依赖这些本机路径运行。关键映射已固化为 fixture/tests，不把旧前端 `Entity.fields` 当作后端 schema。

## 验证

- `npm install`：通过；依赖与 main 相同，零 vulnerabilities。
- `npm run build`：通过（Next.js 16.3.4，含 TypeScript 检查）。
- `npm run lint`：通过。
- `npm test`：25/25 通过（13 项既有流程回归 + 12 项 Stage 1.3 测试）。
- 测试覆盖默认折叠 HTML、推荐/决定分离、Ch13/16/17、NO_CHANGE/Soft gate、成组字段 stale、旧缓存、History owner/holder、证据与示例输出对应。
- 浏览器实际点击与键盘验证补充 automated rendering tests；最终新 origin 的控制台 error 日志为空。

已执行的浏览器验收（本机 dev，初始桌面 1280px，无横向溢出）：

- Library 的 READY Open → Workspace → Review；Setup breadcrumb 正常。
- Review 不展开即可读 Before / After / Recommendation / Decision。全部 details 默认关闭。
- 同时展开 Ch13 holder/owner，分别看到 handoff 和无 ownership evidence；Enter 与点击均可折叠。
- 接受合法 Ch13 变化，owner Reject 后仍有身份 Conflict 时 Commit disabled；拒绝冲突后可提交。
- State 确认 holder 林夏、owner 陈默；History 分列显示；v13 恢复 v11 后新建 v14，Chapter 11，四条历史保留，刷新仍在。
- Ch16 展开 direct disclosure / credential inspection；手动接受并提交后 v16。
- Ch17 展开 formal transition，接受合法变化、拒绝 trust 升级后 v17；State 显示 confirmed_false、knows(false)、bounded cooperation active 与 distrust 并存。
- 原有 frontend flow/localStorage 保留，无后端调用。

开发服务曾因上一轮残留 Next dev 锁退出，已停止本仓库旧进程后在 3013 重启。未修改其他项目。

## 交付边界

仅提交并推送 `ui/stage-1-3-state-diff-review`，不 merge main。先前 Stage 2.1 草稿因用户改为 Stage 1.3 已保存在独立本地 backend 分支 checkpoint，未带入本分支；无后端代码或依赖。

下一步：Product Owner 审核本轮交互和示例；之后再决定合并。Backend、AI Extraction、Context Compiler、RAG、MCP、Auth、真实文件解析、Writer 接线及部署保持 planned。
