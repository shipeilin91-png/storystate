# STORYSTATE_STATE_DATA_CONTRACT_V0.2.1

> **TL;DR**
>
> - **本轮定位**：V0.2.1 是在 V0.2 基础上的最终同步补丁，不重做 ontology，不新增功能。
> - **关键修正**：不再写"Only Event Effect may mutate Current State through Delta"，统一改为 **All Canonical State mutations must go through State Delta**。
> - **边界补强**：Story Event 导致的变化仍走 `Event Effect → Delta`；Append Event 本身永远不能直接 mutate Current State；Human correction / canonical override / retcon / import migration 也可提出 Delta，但同样必须经过 `validation / decision / commit`。
> - **示例同步**：Ch13 改为 holder handoff；Ch16 改为顾言单向获知真实身份、林夏保持 unaware；Ch17 改为 bounded cooperation 成立而 long-term trust 维持 distrust。
> - **输出收敛**：Soft Interpretation 仍不进入 Canonical State Version 主干，只作为绑定 source revision / provenance 的 derived annotation 输出。

---

## 一、定位与修订范围

StoryState 的定位不变：它是面向长篇与连续文本 AIGC 的 Stateful Context Infrastructure，用来维护可持久化、可更新、可追溯、可版本化的 Canonical Current State，而不是 Writer 本身，也不是章节摘要器。

V0.2.1 不是重设计，也不是新一轮扩容。它是在 V0.2 已有主骨架上做最终同步补丁：Evidence、Event Ledger、Knowledge、Canonical Current State、Proposition-centric Character Knowledge、Directed Relationship、Delta Governance、Independent State Version 继续全部保留。

本轮修订只处理三类问题：第一，纠正"只有 Event Effect 才能修改 State"这类过度限制表述，改为所有 canonical mutation 都必须走 State Delta；第二，把 Ch13 / Ch16 / Ch17 示例与 Benchmark Pilot Ground Truth 同步；第三，补上一段只记录本次补丁的 V0.2 → V0.2.1 changelog。

**范围内**：contract 语义修订、examples 同步、changelog 更新。  
**范围外**：ontology 重做、功能新增、API、SQL、Supabase、Validator Rulebook、Agent Memory 扩展。

---

## 二、Core Model

V0.2.1 延续 V0.1 的分层对象模型，但把 Benchmark Pilot 暴露出的歧义进一步写实。重点不是增加更多对象，而是让每个对象的职责边界更硬，避免 Event、State、Knowledge、Interpretation 在运行时互相越权。

### Story
- **它是什么**：一个连续叙事宇宙与其 canonical continuity 的根容器。
- **为什么存在**：提供身份边界、版本边界、命名空间与规则边界，防止不同故事或不同改写线的状态串线。
- **与其他对象的关系**：拥有 Source Documents、Entities、Knowledge、Events、State Versions 与 Delta Ledger。

### Source Document / Chapter
- **它是什么**：叙事输入单元，通常是章节、片段、场景或其 revision。
- **为什么存在**：保存原始文本与 source order，是所有提取、证据、event 的来源，但它本身不是 current state。
- **与其他对象的关系**：可生成 Evidence 与 Event；与 Story Revision 关联；不会直接改写 State。

### Character
- **它是什么**：故事中的稳定角色实体标识，而不是某一章里的描述快照。
- **为什么存在**：给人物状态、知识、关系、事件参与、物品持有等变化提供长期锚点。
- **与其他对象的关系**：被 Knowledge、Relationship、Character Knowledge State、Event、Hard State 引用。

### Fact / Knowledge
- **它是什么**：长期稳定或低频变化的命题化知识，例如背景、世界规则、组织结构、长期设定。
- **为什么存在**：把"长期设定"从"当前状态"里剥离，避免每次章节更新都重算全部世界观。
- **与其他对象的关系**：既可服务 World Truth，也可被 Character Knowledge State 引用为认知对象；V0.2.1 明确只对高价值 continuity fact 命题化。

### Character Knowledge State
- **它是什么**：某角色对某个 proposition、事件命题或 reported proposition 的认知立场，而不是世界真相本身。
- **为什么存在**：解决"世界知道"和"角色知道"不一致的问题，支持 `unaware / suspects / believes / knows`，并正式保留 `believed_value`。
- **与其他对象的关系**：引用 Character 与 Proposition；与 World Truth 并列存在；reported proposition 通过 proposition structure + basis / provenance 表达，不增加 `knows_as_reported`。

### Relationship
- **它是什么**：两个实体之间的有向关系边，分为 structural / explicit operational 与 psychological / interpretive 两层。
- **为什么存在**：关系不是人物字段附属物，而是独立状态对象，因为它天然涉及方向、时间、作用域、证据与不同强度的语义。
- **与其他对象的关系**：连接 Character、Organization、Item 等实体；hard 层记录明确声明、契约、合作状态；soft 层记录心理推断。

### Item
- **它是什么**：需要被追踪存在、归属、占有、托管、位置与条件的物件实体。
- **为什么存在**：很多叙事推进依赖物件状态变化。V0.2.1 明确区分 `owner`、`holder` 与可选的 `custodian`，防止把 physical possession 误写成 ownership。
- **与其他对象的关系**：被 Event 影响，也被 Hard State 持续记录；位置与持有类字段可出现 `unknown / unresolved` 的 epistemic status，但 unknown 不是 domain value。

### Plot Thread
- **它是什么**：故事中仍然开放、待兑现、待解释或待关闭的叙事线程。
- **为什么存在**：防止系统只记"发生过什么"，却不记"还有什么没解决"。它是长期叙事控制的关键对象。
- **与其他对象的关系**：通常由 Event 打开、推进或候选关闭；LLM 可 propose thread 与 resolve，但只有证据真正回答 thread 核心问题时才能 committed as resolved。

### Event
- **它是什么**：历史账本中的一次叙事发生、揭示、声明、报告或动作。
- **为什么存在**：保存时间顺序与因果过程。Event 是"发生过什么"，不是"现在还成立什么"。
- **与其他对象的关系**：来源于 Evidence；以 append-only 方式进入 Event Ledger；可生成零个、一个或多个 Event Effect。

### Evidence
- **它是什么**：指向原文的证据片段、引用范围、说话人、段落位点与来源章节。
- **为什么存在**：让任何重要状态都能被回溯到文本来源。Evidence 证明的是"文本里出现了什么"，不是"解释一定为真"。
- **与其他对象的关系**：被 Event、Knowledge、State Delta、Review Decision、Soft Interpretation 引用。

### Hard State
- **它是什么**：满足进入 canonical truth 条件的明确状态。
- **为什么存在**：这是 Context Compiler 交给 Writer 的主输入，因为它足够明确、可验证、可冲突检查。
- **与其他对象的关系**：属于 State Layer 的 canonical 子集；由 accepted delta 进入；必须带 provenance；不会因为某个 Event 被 append 就自动创建。

### Soft Interpretation
- **它是什么**：基于语气、情绪、潜台词、暧昧动作得出的解释性状态。
- **为什么存在**：它对写作很有价值，但默认不应污染 canonical truth，否则系统会把猜测当事实。
- **与其他对象的关系**：V0.2.1 明确它不进入 Canonical State Version 主干，而是绑定 source revision / provenance 的 derived annotation，仅在独立 Interpretation section 输出。

### State Delta
- **它是什么**：一次对 canonical current state 的候选变更提案，表达 Before → After，而不是直接写库。
- **为什么存在**：把提取与提交解耦。LLM 可以 propose，系统或人类才可以 decide 与 commit。
- **与其他对象的关系**：只针对 stateful target 的 effect 变化；不等于 append event；引用 `target`、`field path`、`before`、`after`、`evidence`、`reason`、`risk`、`decision`、`commit version`。

### State Version
- **它是什么**：某次 commit 之后的完整 canonical current state 版本快照。
- **为什么存在**：保证回滚、比较、审计、再生成的一致性。版本是状态治理对象，不等于章节序号。
- **与其他对象的关系**：由一组 accepted delta 产生；可被 restore；旧版本永不删除，只会被新版本 supersede。

> V0.2.1 的核心仍然是：Source Document 不承担 state；Event 不承担 current truth；Soft Interpretation 不冒充 Hard State；State Version 不挟持章节编号；unknown 不冒充具体字段值。

---

## 三、Current State vs History

V0.2.1 继续坚持一个原则：Current State 只保存"现在仍然成立"的 canonical truth；历史过程进入 Event Ledger；长期设定进入 Knowledge；文本原句进入 Evidence。Benchmark Pilot 暴露的问题是，系统容易把事件出现、对象暂时缺失、位置未知、转述内容统统挤进 Current State。V0.2.1 明确收紧这条边界。

### Current State
**应该放什么**：人物当前地点、生死、当前身份状态、item 的 `owner / holder / custodian`、当前角色认知状态、当前开放或已关闭的 plot threads、当前有效 relationships、当前世界已成立命题，以及必要的 epistemic status。  
**不应该放什么**：完整章节摘要、所有历史动作列表、每一段对话、已经失效的旧 owner、把 unknown 当作 location 字段普通值、把 reported proposition 直接当 world truth。

### Event Ledger
**应该放什么**：谁在何时做了什么、揭示了什么、宣称了什么、报告了什么、发生了什么冲突、哪些事件导致状态变化或未通过验证。  
**不应该放什么**：把 event 本身当成 current truth 字段长期挂在 Character 或 Item 上；把 append event 误当作 delta commit。

### Knowledge Layer
**应该放什么**：高价值 continuity facts、背景设定、世界规则、组织结构、长期身份、长期约束。  
**不应该放什么**：临时场景状态，例如"这一章里在医院门口""刚刚拿到钥匙""刚听到某人转述"。

### Evidence Layer
**应该放什么**：原文片段、章节引用、对话证据、段落位置、说话人、原始措辞。  
**不应该放什么**：任何未经验证就直接提升为 canonical truth 的结构化状态。

V0.2.1 对 **unknown / unresolved** 的要求必须写清：它们是 epistemic condition，不是 domain value。比如"人物离开医院但去向不明"，不能写成 `location = Unknown`，因为 Unknown 不是地点名称。更合理的 contract 表达应是：当前 `location status = unknown` 或 `unresolved`；上一个 last confirmed location 仍是"医院"；相应 provenance 指向最后一次被确认的位置证据。Contract 只要求保留这种设计空间，不在本轮写数据库 schema。

同样，Current State 不应用"event entity absent → created"去偷渡 hard state。Event 在 ledger 中首次出现，只能说明一条历史记录被 append 了；是否有 stateful object 应被 CREATE，仍需由 effect 级 delta 单独判断。

---

## 四、Event → State：Append Event ≠ State Delta

V0.2.1 对这条边界进一步收口：**Append Event ≠ State Delta**。Event append 是向 Event Ledger 追加一条历史记录；State Delta 是对 Canonical Current State 的候选变更提案。两者既不共享语义，也不共享提交条件。

### Append Event
- **它做什么**：把一条叙事发生、揭示、声明或报告写入 Event Ledger。
- **不能偷换成什么**：不能偷换成"某个 hard state 已创建"或"某对象进入 canonical truth"。

### Propose State Delta
- **它做什么**：对 canonical state 的任何候选变更提出 Before → After。
- **来源可以是什么**：可以来自 Story Event 的 effect，也可以来自 human correction、canonical override、retcon、import migration 等非 Event 来源。
- **共同约束**：无论来源是什么，只要要改 Canonical Current State，就必须进入 `State Delta → validation → decision → commit` 这条治理链。

### Story Event 的特例
- **Story Event 导致状态变化时**：仍然必须先抽象为 Event Effect，再由 Event Effect 进入 Delta。
- **为什么这样做**：因为被提交的是"事件对当前状态造成了什么变化"，而不是"这个事件本身被记录下来了"。

### Forbidden Pattern
- **被禁止的模式**：用"Event entity absent → created"作为 Hard State Delta 逻辑。
- **为什么禁止**：因为它把 ledger existence 错当成 canonical truth admission。

正确顺序分成两类：

- **Story Event path**：`Evidence → Append Event → Derive Event Effect → Propose Delta → Validate → Conflict Check → Review（必要时）→ Commit`
- **Non-Event patch path**：`Correction / Override / Retcon / Migration Input → Propose Delta → Validate → Conflict Check → Review（必要时）→ Commit`

Event 可以只存在于 Ledger 而不产生任何 delta；也可以对应多个 effect；还可以只生成 soft interpretation annotation。相反，某些 canonical mutation 即使不来自 Event，也仍然必须通过 Delta 才能写入 Current State。

**Append Event 本身永远不能直接 mutate Current State，这条规则在 V0.2.1 中是硬约束。**

---

## 五、Knowledge Boundary：World Truth、Reported Proposition 与 Character Knowledge

V0.2.1 保留 V0.1 的 proposition-centric 设计，但把 reported proposition 与 belief 语义补齐。关键原则是：角色知识不是布尔字段，而是"角色对某个 proposition 当前处于什么认知立场"。

### Proposition / Fact
- **职责**：定义一个可被判断、可被知晓、可被误信、可被转述的命题。
- **V0.2.1 要求**：只对高价值 continuity fact 命题化，例如身份、归属、揭示、关键因果。

### World Truth State
- **职责**：记录命题在世界层当前是否成立。
- **V0.2.1 要求**：推荐值仍为 `confirmed_true / confirmed_false / unresolved`；reported proposition 不自动写入这里。

### Character Knowledge State
- **职责**：记录某角色对该命题当前持有什么认知立场。
- **V0.2.1 要求**：只保留 `unaware / suspects / believes / knows`；正式保留 `believed_value`；不增加 `knows_as_reported`。

### Basis / Provenance
- **职责**：记录角色为什么持有该认知立场。
- **V0.2.1 要求**：可表达 `direct observation`、`direct disclosure`、`reported by X`、`deduced from evidence` 等来源，不改变 stance 集合本身。

### 四种 stance 的 V0.2.1 语义

| Stance | 含义 |
|--------|------|
| `unaware` | 角色没有接触到该命题，或叙事上没有理由认为他知情 |
| `suspects` | 角色开始怀疑某命题可能为真或为假，但证据不足，认知仍不稳定 |
| `believes` | 角色形成了相对明确的主观判断，但该判断未必与世界真相一致；此时应显式保留 `believed_value` |
| `knows` | 叙事上已经足够明确地建立，该角色掌握了被 contract 承认为"知道"的内容 |

V0.2.1 需要特别澄清 **reported proposition**。例如：

> Character knows `"何叔声称 P"` ≠ Character knows `P`

前者是一个可以独立命题化的 proposition，例如"何叔声称陈默是卧底"；后者是世界层或角色层对"陈默是卧底"本身的判断。二者应通过 proposition structure + basis / provenance 连接，而不是发明 `knows_as_reported` 这种新 stance。

**false belief** 在 V0.2.1 中是正式语义，而不是边角案例。例如：`WorldTruth[P] = confirmed_false`；Character A 对 P 的状态可以是 `believes`，`believed_value = true`。系统由此表达"角色确实相信 P"，但不会把这个 belief 错写成 world truth。

**belief correction** 则表示一个角色从旧 belief 迁移到更正后的认知状态。更正后的 `after` 可以是 `suspects`、`believes`（`believed_value` 反转）或 `knows`，取决于新证据强度。重要的是：这是一条显式 delta，而不是系统悄悄把 `believed_value` 覆盖掉。belief correction 必须保留 `basis`、`evidence` 与 `provenance`，才能解释角色为什么改观。

---

## 六、Relationship：Directed、分层、且可 scope-bounded

V0.2.1 保留 directed relationship，但把 hard / soft 的判定规则写得更明确：不是所有"关系"都能进入 canonical state。只有 structural / explicit operational relationship state 才能进入 Hard State；psychological / interpretive relationship state 默认只作为 derived annotation。

### Structural Relationship
- **典型内容**：血缘、婚姻、组织隶属、师徒、债务、契约、监护、公开身份关系。
- **V0.2.1 处理方式**：可进入 Hard State；需要明确宣告或强证据支撑；默认有向，不自动双向镜像。

### Explicit Operational Relationship
- **典型内容**：本次合作、当前盟约、任务级协同、临时停火、明确授权、条件性配合。
- **V0.2.1 处理方式**：可进入 Hard State，但必须带 scope、条件与 provenance；不自动外推为长期人格关系。

### Psychological / Interpretive Relationship
- **典型内容**：信任、爱意、保护欲、戒备、依赖、愧疚、暧昧、敌意缓和。
- **V0.2.1 处理方式**：默认进入 Soft Interpretation；除非文本有非常明确、可约束范围的声明，否则不进 Hard State。

### Scope-bounded Declaration
- **典型话语**：`"这一次我信你"`、`"今晚先按你的方案走"`、`"这件事上我站你这边"`
- **V0.2.1 处理方式**：优先解释为 `explicit / conditional cooperation stance`，而不是长期 `full trust`。

这意味着，像"信任、爱意、保护欲"这样的心理推断，即便对 Writer 很有价值，V0.2.1 也默认只保留在 derived annotation 层。反过来，明确声明、契约、合作状态则可以进入 Hard State，因为它们对后续行动约束更强，也更容易验证。

V0.2.1 的关键收口是：**directed** 解决"谁对谁"，**layered** 解决"什么关系可进 canonical"，**scope-bounded** 解决"这次信任不等于永久信任"。

---

## 七、State Delta：All Canonical State Mutations Must Go Through State Delta

State Delta 仍是 StoryState 的治理核心。V0.2.1 对它的要求不是"只有 Event Effect 才能修改 State"，而是：**所有 Canonical State mutation 都必须通过 State Delta**。区别只在于 mutation 的来源不同：Story Event 来源需要先抽象为 Event Effect；非 Event 来源则可直接提出 Delta，但同样必须走完整治理链。

### Delta 字段与 V0.2.1 要求

| 字段 | 说明 |
|------|------|
| `operation` | 变更类型：至少支持 `CREATE / UPDATE / CLOSE / RESOLVE / INVALIDATE / NO_CHANGE` |
| `target` | 目标对象，必须能唯一指向 stateful object |
| `field / path` | 字段路径，例如 `Item[USB].holder`、`CharacterKnowledge[林夏,P].believed_value` |
| `before` | 旧值，必须显式写出当前 canonical 值或 epistemic status |
| `after` | 新值，结构化结果；`unknown / unresolved` 只能作为 epistemic status |
| `evidence` | 证据锚点，至少引用 source chapter 与原文片段 |
| `reason` | 提案理由，说明为什么该 evidence 足以支持这次变化 |
| `confidence` | 提案把握，只用于 review 排队与阈值分流 |
| `risk` | 风险标签，例如 `conflict-prone`、`ownership-uncertain`、`soft-signal` |
| `proposed_by` | 提案来源：LLM、rule engine、human editor、migration/import 均应可区分 |
| `decision` | 审核结果：`accepted / rejected / needs_review / deferred` |
| `commit version` | accepted 后必须记录进入了哪个 state version |

### operation 语义补充

- **CREATE**：新对象或新状态首次进入 canonical scope；对 Event 来源，它的依据必须是被验证的 Event Effect，而不是"ledger 中第一次看见某个 event"；对非 Event 来源，则必须有明确 correction / override / migration basis。
- **UPDATE**：既有对象仍存在，但某个字段值或 epistemic status 发生变化。
- **CLOSE / RESOLVE**：对象没有消失，只是从 active 变为 closed，例如 plot thread 真正获得解答。
- **INVALIDATE**：某个既有 canonical 断言被判定为错误、重复、误提取、被 retcon 推翻，或被人工 canonical correction 撤销，但历史记录必须保留。
- **NO_CHANGE**：系统检索到相关内容，但验证后认为不应改动 canonical state，例如只有 append event、只有 soft signal、只有 reported proposition，或 correction basis 不足。

### Plot Thread resolved 的 Evidence Sufficiency 原则

只有证据真正回答了 thread 的核心问题，thread 才能 resolved。强推断、强烈暗示、读者大概率能猜到，不等于 resolved。比如 thread 的核心问题是"USB 现在由谁持有、谜面是否已被解开"，只有当证据真正回答了这个核心问题，才可以关闭；如果只是局部推进，就应保持 `progressing` 而不是 resolve。

### DELETE 的位置

V0.2.1 仍不推荐把 DELETE 作为对外 contract 的常规操作。已提交的 canonical state，通常应该 INVALIDATE 或 supersede，而不是物理删除。这样才能保住版本链、审计链与 provenance 链。

---

## 八、Version：Chapter、Story Revision、State Version 继续强分离

这三个概念在 V0.2.1 仍必须严格分离，否则系统一进入 rewrite、回滚、延迟审核、多章合并提交等场景就会崩。V0.2.1 只对时间语义与 rewrite 处理补充收敛性决定，不改变主结构。

### Chapter / Episode
- **它表示什么**：叙事输入顺序中的一章、一集或一个片段编号。
- **V0.2.1 约束**：`source order required`；这是 contract 的基础时间序。

### Story Revision
- **它表示什么**：某个 source document 的改写版本、替换版本或分支版本。
- **V0.2.1 约束**：同一章可能有 `r1 / r2 / r3`；rewrite 对 state 的重新评估在 V1 采用人工触发 `re-evaluate`。

### State Version
- **它表示什么**：某次 accepted delta commit 之后的 canonical current state 快照。
- **V0.2.1 约束**：与章节编号无关；soft interpretation 不进入其主干；restore 生成新版本而不是删旧版本。

**story-time** 在 V0.2.1 是 optional 语义。系统必须先保证 source order 清晰可靠；如果未来需要补充故事内时间轴，可以作为附加层，而不是现阶段的主排序依据。

因此，V0.2.1 继续坚持：章节是输入秩序，revision 是文本演化，state version 是 canonical truth 的提交历史。三者都需要，但谁也不替代谁。

---

## 九、Source of Truth：冲突优先级继续收紧

V0.2.1 不改变 V0.1 的大体优先级，但把一条常见混淆写得更硬：reported proposition 不会自动升级成 world truth；append event 也不会自动覆盖 current state。谁能"写入 canonical"，仍然取决于 validation 与 commit，而不是文本出现次数。

1. **P1 — User confirmed canonical state**  
   最高优先级。可直接覆盖下层来源；V0.2.1 暂不设计复杂 user lock，只保留未来空间。
2. **P2 — Committed state / committed event effect**  
   当前运行中的 canonical truth。除非被更高优先级显式修正，或被新的 accepted delta supersede，否则保持生效。
3. **P3 — Retrieved raw text / evidence**  
   对"文本里写了什么"最权威，但不能直接覆盖 P1、P2；只能生成 event append、delta proposal 或 review signal。
4. **P4 — Knowledge summary**  
   可作为 retrieval shortcut 与缺省填充来源，但不能压过 raw evidence 与 committed state。
5. **P5 — LLM inference**  
   最低优先级。只能提出候选解释、补全、冲突提示，永远不能直接覆盖任何上层来源。

配合三条具体规则：
- raw evidence 能纠正 summary 与 inference，但不能绕过 delta 直接写 current state。
- reported proposition 只能先进入 proposition / character knowledge 结构，不能自动进 world truth。
- 较老 evidence 不能静默覆盖更新的 canonical version。

---

## 十、Invariants：V0.2.1 必须守住的系统不变量

1. **LLM output cannot directly mutate canonical state.** LLM 只能 propose delta，不能直接 commit。
2. **Current State stores current truth, not full history.** 历史过程进入 Event Ledger 与 Evidence。
3. **All Canonical State mutations must go through State Delta.** 任何 canonical mutation，无论来源是什么，都必须先成为 Delta。
4. **Story Event–driven state changes must go through Event Effect → Delta.** Story Event 的状态变化必须先抽象为 Event Effect，再进入 Delta。
5. **Event append is not a State Delta.** Append Event 只进入 Event Ledger，不等于对 Current State 的变更提案。
6. **Append Event can never directly mutate Current State.** event 被记录下来，不等于 state 已被改写。
7. **Event entity absent → created is forbidden as a Hard State Delta pattern.** 不能用 ledger 中首次出现的 event 偷渡 hard state admission。
8. **Unknown is an epistemic condition, not a domain value.** `unknown / unresolved` 只能表达认知状态，不能充当 location、owner 等字段的普通枚举值。
9. **World Truth does not auto-propagate into Character Knowledge.** 角色知情必须单独建立。
10. **Reported proposition does not become world truth automatically.** "X 声称 P" 与 "P 为真" 必须在 contract 层分开。
11. **Character Knowledge keeps the stance set unaware / suspects / believes / knows.** reported semantics 通过 proposition + basis 表达，不增加 `knows_as_reported`。
12. **Belief can be false and correction must be explicit.** `believed_value` 可以与 world truth 不一致；belief correction 必须以 delta 明确记录。
13. **Physical possession does not automatically imply ownership.** `owner / holder / custodian` 必须分开判断。
14. **Relationship edges are directed by default.** 不允许系统默认双向一致。
15. **Psychological interpretation does not automatically become Hard State.** 心理推断默认只作为 derived annotation。
16. **Soft Interpretation does not enter Canonical State Version trunk.** 它绑定 source revision / provenance，独立输出，不写入主干版本。
17. **Plot Thread can be resolved only by evidence sufficiency, not by strong inference.** 强推断不等于 thread 已被回答。
18. **State Version is independent from Chapter numbering.** 章节、改写与提交历史必须分开。
19. **Rollback creates a new version, not history deletion.** restore 是新增 version，不是抹掉过去。
20. **Older evidence cannot silently overwrite newer canonical state.** 时间顺序与已提交版本优先。
21. **Committed assertions should be invalidated or superseded, not physically erased.** 删除不能破坏审计链。
22. **No delta without before / after / target / evidence / decision.** 缺任何一项，都不应视为可提交变更。

---

## 十一、Examples：《雾港》Benchmark Pilot Chapter 13–17

以下三个示例仅用于同步 contract 语义，并严格对齐本轮给定的 Benchmark Pilot Ground Truth。这里不再为了讲解自行补造《雾港》事实；如果未来可读取到更新后的 `STORYSTATE_BENCHMARK_PILOT_V0.2.2`，也应以更新后的 benchmark 为准重放同一 contract 逻辑。

### 11.1 Ch13 USB holder handoff

**Before State**：
```
Item[USB].owner    = 陈默
Item[USB].holder   = 陈默
Item[USB].status   = encrypted
PlotThread[USB Mystery].status = open
```

**Event**：陈默将 USB 放入林夏手中并让她保管。

**Append Event**：向 Event Ledger 追加 `Event e_ch13_usb_holder_handoff`，记录 source chapter、参与方与原文证据。

**Proposed Delta**：
```
UPDATE  Item[USB].holder                    : 陈默 → 林夏
NO_CHANGE Item[USB].owner                  : 陈默
NO_CHANGE Item[USB].status                 : encrypted
UPDATE  PlotThread[USB Mystery].status     : open → progressing
```

**Validation**：Benchmark Ch13 只支持 holder handoff，不支持 ownership transfer。physical possession 改变，不自动代表 ownership 改变。USB Mystery 只被推进，没有被真正解答，因此 thread 只能从 `open` 进入 `progressing`，不能 `resolved`。

**Review**：通过；系统显式记录这是一次 `holder` 变化，而不是 `owner` 变化；也是一次 thread progression，而不是 closure。

**Commit**：accepted，进入新的 State Version；Event 留存在 Event Ledger，Delta 写入 Canonical Current State。

**Resulting State**：
```
Item[USB].owner    = 陈默
Item[USB].holder   = 林夏
Item[USB].status   = encrypted
PlotThread[USB Mystery].status = progressing
```

---

### 11.2 Ch16 same World Truth, different Character Knowledge

**World Truth P**：陈默是市刑侦支队警察，并正在港务安保中卧底。

**Before State**：
```
WorldTruth[P]                                    = confirmed_true
CharacterKnowledge[顾言, P].stance               = unaware
CharacterKnowledge[林夏, P].stance               = unaware
CharacterKnowledge[林夏, Q: 陈默公开身份不完整].stance = suspects
```

**Evidence**：陈默只向顾言进行 direct disclosure，并允许 credential inspection。

**Append Event**：向 Event Ledger 追加 `Event e_ch16_direct_disclosure_to_guyan`，记录 disclosure 与 credential inspection 两个证据锚点。

**Proposed Delta**：
```
UPDATE    CharacterKnowledge[顾言, P].stance   : unaware → knows
NO_CHANGE CharacterKnowledge[林夏, P].stance   : unaware
NO_CHANGE CharacterKnowledge[林夏, Q].stance   : suspects
NO_CHANGE WorldTruth[P]
```

**Validation**：Ch16 的 contract 重点不是 world truth 变化，而是 knowledge boundary。P 在世界层早已成立；这一次变化发生在顾言的 knowledge state。由于 direct disclosure 与 credential inspection 只发生在顾言这条链路上，林夏对 P 仍保持 `unaware`。她最多只对另一个命题"陈默公开身份不完整"维持 `suspects`。

**Review**：通过；系统明确拒绝让林夏在 Ch16 获得 P，也不把 Q 的怀疑偷换成对 P 的 knowledge。

**Commit**：accepted，进入新的 State Version。

**Resulting State**：
```
WorldTruth[P]                                    = confirmed_true
CharacterKnowledge[顾言, P].stance               = knows
CharacterKnowledge[林夏, P].stance               = unaware
CharacterKnowledge[林夏, Q].stance               = suspects
```

> 这个例子展示的核心是：**same World Truth + different Character Knowledge** 可以在同一版本中同时成立。

---

### 11.3 Ch17 bounded cooperation without long-term trust repair

**Before State**：
```
RelationshipHard[林夏 → 陈默, long_term_trust]                  = distrust
RelationshipHard[林夏 → 陈默, explicit_bounded_cooperation_stance] = none
# Soft psychological trust 不在 Canonical Current State 主干中
```

**Proposed Delta**：
```
NO_CHANGE RelationshipHard[林夏 → 陈默, long_term_trust]                  : distrust
UPDATE    RelationshipHard[林夏 → 陈默, explicit_bounded_cooperation_stance]: none → bounded_cooperation
          basis = declared_trust_for_current_escape
NO_CHANGE Soft psychological trust in Canonical State
```

**Validation**：Benchmark Ch17 支持的是一个明确、有限范围的合作性声明，即对当前逃离场景的 declared trust / bounded cooperation。它不支持把 long-term trust 从 `distrust` 直接改写成长期信任状态。

**Review**：通过；系统把"这次配合成立"写入 hard relationship，但明确阻止"心理信任已修复"进入 Canonical Current State。任何心理层面的信任波动，仍只能作为 derived annotation 留在 Soft Interpretation。

**Commit**：accepted，进入新的 State Version；Soft Interpretation 单独保留 provenance，但不进入 canonical trunk。

**Resulting State**：
```
RelationshipHard[林夏 → 陈默, long_term_trust]                  = distrust
RelationshipHard[林夏 → 陈默, explicit_bounded_cooperation_stance] = bounded_cooperation
basis = declared_trust_for_current_escape
# Soft psychological trust 仍不自动进入 Canonical Current State
```

---

## 十二、Architecture Recommendation：推荐的 V0.2.1 Contract

V0.2.1 的推荐不是扩容，而是收紧。它要做的不是把 StoryState 做成更大的记忆系统，而是把 canonical truth 的 admission rules 写得更明确，避免 Benchmark Pilot 中出现的语义偷换。

继续保留四层：`Evidence Layer → Event Ledger → Knowledge Layer → Canonical Current State`  
继续保留两条治理链：`Delta Lifecycle` 与 `Independent State Version Lifecycle`  
把 Soft Interpretation 明确降为 derived annotation layer，而不是 canonical trunk 的组成部分

### 具体推荐

| 领域 | 推荐方案 | 原因 |
|------|----------|------|
| Event handling | Event append 只进入 Event Ledger；所有 Canonical Current State 变更走 State Delta；Story Event 来源仍要求 `Event Effect → Delta` | 彻底切断"事件存在 = 状态成立"的偷换，同时保留 non-Event patch 合法入口 |
| Item possession | 明确 `owner / holder / custodian` 三种语义；`custodian` 为可选 | 防止把 temporary possession 或代持误写成 ownership |
| Unknown semantics | `unknown / unresolved` 是 epistemic status，不是 domain value；保留 last confirmed value / provenance 设计空间 | 避免用"Unknown"污染业务字段本体 |
| Character knowledge | 保留 `unaware / suspects / believes / knows`；保留 `believed_value`；reported proposition 用 proposition + basis 表达 | 足够表达 false belief、belief correction 与转述链，不膨胀 stance 集合 |
| Relationship | hard 层只收 structural / explicit operational；psychological / interpretive 默认为 soft annotation | 让当前行动约束进入 canonical，同时避免把心理暗流误写成事实 |
| Plot thread | LLM 可 propose thread 与 resolve；只有 evidence sufficiency 满足时才能 commit resolved | 防止 thread 被强推断过早关闭 |
| Soft Interpretation | 不进入 Canonical State Version 主干；绑定 source revision / provenance，作为 derived annotation 存在 | 保留写作价值，同时不污染 canonical state |
| User lock | 暂缓复杂机制 | 当前 contract 先定义 truth admission，不扩写 override governance |
| Event time | `source order required`；`story-time optional` | 先保证可审计的输入秩序，再补叙事内时间轴 |
| Rewrite | V1 人工触发 `re-evaluate` | 避免 V0.2.1 在 rewrite 场景引入过高自动化复杂度 |
| Review threshold | 留给 Validator Rulebook | contract 只定义语义与边界，不在本轮承载规则细则 |
| Soft Context output | 默认不进入 primary context；只以独立 Interpretation section 输出 | 保护 primary context 的 canonical purity |

> **一句话概括 V0.2.1**：不扩架构，只把 admission 边界、epistemic 语义与 hard / soft 分层做得更硬。

---

## 十三、Open Questions：收敛后仍待 Product Owner 决策的少数问题

1. "高价值 continuity fact" 的最小命题化清单是否需要在产品层给出白名单，例如身份、归属、位置、知情、契约、关键 thread？
2. `unknown / unresolved` 除 location、ownership、knowledge 之外，哪些状态域需要在产品表现层被一视同仁地显式展示？
3. 当已 resolved 的 Plot Thread 因后续证据被重新打开时，产品更倾向于复用原 thread identity，还是生成带 lineage 的 successor thread？
4. `custodian` 作为可选语义，是默认对所有 Item 开放，还是只对证据保管、机构保管、委托代持等对象类型开放？

其余 Benchmark Pilot 暴露的决策项，在 V0.2.1 中已完成收敛：Soft Interpretation 不进 canonical trunk；复杂 user lock 暂缓；believes 保留；Event time 以 source order 为主；rewrite 放到 V1 人工 re-evaluate；Plot Thread 可 propose 但不可直接 commit；review threshold 转交 Validator Rulebook；soft context 仅独立输出。

---

## 十四、结论

> **推荐结论**：StoryState State Data Contract V0.2.1 不改变 V0.2 的 ontology 与能力边界，而是完成两类最终同步：一类是 invariant 纠偏，把"Event-only mutation"收敛为"all canonical mutation must go through State Delta"；另一类是 Benchmark Example 对齐，把 Ch13、Ch16、Ch17 全部修正到给定 Ground Truth。这样 contract 既保住 canonical state 的治理一致性，也避免示例继续把错误事实反向固化进产品语义。

---

## 十五、V0.2 → V0.2.1 CHANGELOG

### 1. Invariant correction
- 删除过度限制的 invariant：`Only Event Effect may mutate Current State through Delta.`
- 统一改为：`All Canonical State mutations must go through State Delta.`
- 同步补充三条约束：
  - Story Event 导致的状态变化必须由 `Event Effect → Delta`
  - Append Event 本身永远不能直接 mutate Current State
  - Human correction / canonical override / retcon / import migration 等非 Event 来源，也可以提出 Delta，但同样必须经过 `validation / decision / commit`
- 正文所有同类绝对表述已同步收敛，避免把 Delta 错写成 Event-only 机制。

### 2. Example synchronization
- **Ch13**：由 `USB transfer` 修正为 `USB holder handoff`；owner 保持陈默不变；holder 变更为林夏；`USB Mystery` 由 `open → progressing`，不再写 `resolved`。
- **Ch16**：按 Benchmark 改为同一 World Truth 下的非对称 Character Knowledge；顾言 `unaware → knows`，林夏对 P 保持 `unaware`；删除"何叔声称 P"那条示例路径。
- **Ch17**：按 Benchmark 改为 `long-term trust = distrust / NO_CHANGE`，以及 `explicit bounded cooperation stance: none → bounded_cooperation`；Soft psychological trust 仍不得自动进入 Canonical State。
- 整个 Examples Section 已按本轮提供的 Benchmark Ch13 / Ch16 / Ch17 Ground Truth 重写，不再为讲解自行创造新的《雾港》事实。
