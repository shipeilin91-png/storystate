# STORYSTATE_VALIDATOR_RULEBOOK_V0.1.1

> **定位一句话**：Validator Rulebook 不回答"State 长什么样"，而回答"一个 Proposed State Delta 是否有资格进入 Canonical State 的决策流程"。
>
> **适用前提**：本规则书以 `STORYSTATE_STATE_DATA_CONTRACT_V0.2.1` 与 `STORYSTATE_BENCHMARK_PILOT_V0.2.2` 为冻结输入；本轮不修改 State Contract，不修改 Benchmark。

---

## 1. Purpose

### 1.1 What Validator Does

Validator 位于 State Delta 生命周期中：

```text
Proposed Delta
→ Validation
→ Conflict Check
→ Decision Recommendation
→ Delta Decision
→ Commit
```

Validator 的职责是对每个 Proposed State Delta 进行 admission gating：判断它是否结构合法、是否与当前 canonical before-state 对齐、是否有足够证据、是否越过 knowledge / relationship / temporal / event-state 边界，并给出风险级别与推荐决策。

Validator 输出的是 **recommendation**，不是最终提交行为。

### 1.2 What Validator Must Not Do

Validator 不能：

- 直接写入 Canonical State。
- 替代 Human Review。
- 修改 Ground Truth。
- 重新定义 State Contract。
- 根据文本强推断自行补造 canonical truth。
- 把 Event append 偷换为 Current State mutation。
- 把 reported proposition 自动提升为 World Truth。
- 把 Soft Interpretation 自动提升为 Hard State。

### 1.3 Validator Inputs

每次验证至少需要以下输入：

| Input | Required | Purpose |
|---|---:|---|
| Proposed Delta | Yes | 待验证的候选变更，包括 target / field path / operation / before / after / supporting basis / provenance / reason |
| Current Canonical State | Yes | 用于 before-state 对齐与冲突检查 |
| State Contract | Yes | 用于 schema、枚举、对象边界、mutation 语义检查 |
| Supporting Basis / Provenance | Yes | 用于判断 proposed after 的依据与来源是否充分、可审计；不得是无 provenance 的裸 mutation |
| Source Revision + Textual Evidence Anchor | Conditional | Story-derived Delta 必须提供 source revision 与文本证据锚点 |
| Correction / Override / Migration Basis | Conditional | Human Correction / Canonical Override / Retcon / Import Migration 可使用 human decision、migration source、correction basis 或 override provenance，不强制提供 story-text evidence |
| Event / Event Effect Context | Conditional | 当 delta 来源于 story event 时，用于确认 Event → Effect → Delta 链路 |
| Existing Decisions / Delta Ledger | Conditional | 用于识别 stale proposal、重复 delta、retcon、override、conflict |

### 1.4 Validator Outputs

Validator 对每个 Proposed Delta 输出：

| Output | Meaning |
|---|---|
| `validation_status` | `passed / failed / conflict / needs_review` |
| `failed_checks` | 未通过的规则族与具体原因 |
| `risk_level` | `LOW / MEDIUM / HIGH / CONFLICT` |
| `recommended_decision` | `AUTO_ACCEPT_ELIGIBLE / NEEDS_REVIEW / REJECT / CONFLICT` |
| `reason` | 人类可读解释，说明为什么允许、拒绝或转人工 |
| `required_review_focus` | 如需人工审核，指出应审核 ownership、knowledge、timeline、relationship 等哪类问题 |

---

## 2. Validation Pipeline

### 2.1 Pipeline Overview

Validator 应按固定顺序运行，因为后续检查依赖前置检查的结构可信度。

```text
1. Delta Completeness Check
2. Schema Validation
3. Before-State Validation
4. Evidence Sufficiency Validation
5. Boundary Validation
   5.1 Knowledge Boundary
   5.2 Relationship Boundary
   5.3 Plot Thread Boundary
   5.4 Temporal Boundary
   5.5 Event vs State Boundary
6. Conflict Check
7. Risk Classification
8. Decision Recommendation
```

### 2.2 Stop / Continue Policy

| Stage | If Failed | Continue? | Reason |
|---|---|---:|---|
| Completeness | `REJECT` | No | 缺 target / before / after / supporting basis / provenance 等基础字段时无法验证 |
| Schema | `REJECT` | Usually No | 字段路径、枚举、operation 不合法时，证据再强也不能提交 |
| Before-State | `CONFLICT` | Limited | 可继续收集诊断信息，但不能 silent commit |
| Evidence Sufficiency | `REJECT` or `NEEDS_REVIEW` | Yes | 可继续判断风险与 review focus |
| Boundary | `REJECT` or `NEEDS_REVIEW` | Yes | 用于明确是 knowledge、relationship、temporal 还是 event-state 越界 |
| Conflict Check | `CONFLICT` | Yes | 产出 conflict reason 与人工处理建议 |

### 2.3 Validation Is Not Decision

Validator 只产生 recommendation：

```text
Validator Recommendation
→ Delta Decision: accepted / rejected / needs_review / deferred
→ Commit only if accepted
```

最终状态仍由 Delta Decision 层决定。即使 Validator 给出 `AUTO_ACCEPT_ELIGIBLE`，系统实现上也仍应记录 decision，而不是跳过 decision object。

---

## 3. Rule Families

## 3.A Schema Validation

Schema Validation 检查 delta 是否符合 State Contract 的对象、字段、枚举与操作边界。

### 3.A.1 Target Must Exist or Be Creatable

Delta 的 `target` 必须满足：

- 对 `UPDATE / CLOSE / RESOLVE / INVALIDATE / NO_CHANGE`：target 必须能在当前 canonical scope 中唯一定位。
- 对 `CREATE`：target 不应与既有 canonical object 冲突；创建原因不能仅是"Event ledger 中首次出现"。
- 对 derived / soft object：不得伪装成 Hard State target。

**Reject examples**：

```text
UPDATE Character[UnknownWoman].location: null → Pier
```

如果 `UnknownWoman` 没有 canonical identity resolution，则 target 不合法。

### 3.A.2 Field / Path Must Be Legal

`field / path` 必须是 contract 允许的 stateful path。例如：

```text
Item[USB].holder
Item[USB].owner
CharacterKnowledge[林夏, P].stance
CharacterKnowledge[林夏, P].believed_value
RelationshipHard[林夏 → 陈默, explicit_bounded_cooperation_stance]
PlotThread[USB Mystery].status
```

**Reject examples**：

```text
Character[林夏].knows_secret = true
CharacterKnowledge[林夏, P].stance = corrected
Relationship[林夏, 陈默].trust_feeling = probably_repaired
```

原因：

- `knows_secret = true` 没有 proposition-centric knowledge structure。
- `corrected` 不是合法 stance。
- psychological feeling 不应直接进入 Hard State。

### 3.A.3 Operation Must Be Allowed

允许的 operation 至少包括：

| Operation | Valid Use |
|---|---|
| `CREATE` | 创建新 stateful object 或首次引入 canonical state assertion |
| `UPDATE` | 修改既有对象字段或 epistemic status |
| `CLOSE` | 关闭仍保留历史身份的对象 |
| `RESOLVE` | 解决 plot thread 或 unresolved state |
| `INVALIDATE` | 使既有 assertion 失效但保留审计链 |
| `NO_CHANGE` | 明确记录验证后不改变 canonical state |

不推荐 `DELETE` 作为常规对外 operation。已提交的 canonical state 应被 `INVALIDATE` 或 supersede，而不是物理删除。

### 3.A.4 Before / After Must Be Structurally Legal

`before` 与 `after` 必须符合目标字段的数据形态。

| Field Type | Legal After | Illegal After |
|---|---|---|
| Character location | 具体地点实体或合法 location status 结构 | `location = "Unknown"` |
| CharacterKnowledge stance | `unaware / suspects / believes / knows` | `corrected / hearsay / maybe_knows` |
| WorldTruth status | `confirmed_true / confirmed_false / unresolved` | `rumored_true` |
| Item holder | Character / Organization / valid holder entity / unresolved status structure | `holder = unknown` as domain value |
| PlotThread status | `open / progressing / resolved` | `almost_resolved` |

### 3.A.5 Unknown Is Not a Domain Value

`unknown / unresolved` 是 epistemic condition，不是领域值。

**Forbidden**：

```text
Character[林夏].location = "Unknown"
Item[USB].owner = "Unknown"
```

**Allowed pattern**：

```text
Character[林夏].location_status = unresolved
Character[林夏].last_confirmed_location = Hospital Gate
```

或者在 contract 允许的字段结构中表达：

```text
Item[USB].holder.status = unresolved
Item[USB].holder.last_confirmed_value = 林夏
```

Schema-valid 只说明字段形态可被系统理解，不说明证据已经足够。

### 3.A.6 NO_CHANGE Is Audit, Not Mutation

`NO_CHANGE` 可以进入 Delta Ledger 和 / 或 Validation Audit，用于记录候选变化已被评估、但不应改变 Canonical State。

`NO_CHANGE` 不是 Canonical mutation。记录可包含：

```text
evaluated_against_version
evidence / provenance
reason
decision
```

但不得 apply state mutation。`NO_CHANGE` 单独存在时不得创建新的 State Version；若一个 commit batch 只有 `NO_CHANGE`，State Version 不递增。若同一 batch 同时包含 accepted mutation 与 `NO_CHANGE`，版本变化只由实际 mutation 产生。

---

## 3.B Before-State Validation

Before-State Validation 检查 `delta.before` 是否等于当前 canonical value。

### 3.B.1 Exact Before Match Required

对任何 mutation delta：

```text
delta.before == CurrentCanonicalState[target.path]
```

才允许进入后续可提交判断。

如果不同，必须标记：

```text
STALE_BEFORE / CONFLICT
```

并禁止 silent commit。

### 3.B.2 Stale Before

`STALE_BEFORE` 表示 delta 是基于旧版本 state 生成的。例如：

```text
Current: Item[USB].holder = 林夏
Delta:   Item[USB].holder: 陈默 → 顾言
```

该 delta 的 before 已过期。即使 evidence 看起来支持"顾言拿到 USB"，也不能直接提交，因为真实链路可能是：

```text
陈默 → 林夏 → 顾言
```

Validator 应推荐：

```text
risk_level = CONFLICT
recommended_decision = CONFLICT
reason = before does not match current canonical holder
```

### 3.B.3 No Silent Merge

Validator 不得自动把 stale delta 改写为新的 delta。它可以建议重新生成：

```text
Regenerate delta against latest canonical state.
```

但不能直接把：

```text
陈默 → 顾言
```

改成：

```text
林夏 → 顾言
```

除非新的 evidence 与 updated before 被明确重新提交。

---

## 3.C Evidence Sufficiency

Evidence Sufficiency 检查 supporting basis 是否足以支持 proposed after。对 Story-derived Delta，检查 textual Evidence anchor，而不是只检查文本里是否出现了相关词；对非故事来源 patch，检查相应 provenance 的明确性、可追溯性与权限基础。

### 3.C.1 General Supporting Basis Rule

每条 delta 必须具备可审计的 supporting basis / provenance，并满足与来源类型相匹配的充分性要求：

```text
Every Delta must have supporting basis / provenance.
Story-derived Delta requires source revision + textual Evidence anchor.
Human Correction / Canonical Override / Retcon / Import Migration
may use human decision / migration source / correction basis / override provenance.
No bare mutation without provenance.
```

对 Story-derived Delta，Evidence 必须精确支持该 mutation type、target、field 与 before→after transition。证据足以支持一个较弱 mutation，不代表可以支持更强 mutation。

对 Human Correction / Canonical Override / Retcon / Import Migration，不强制要求 story-text evidence；Validator 应验证其 human decision、migration source、correction basis 或 override provenance 是否明确、可追溯且有权作为该 mutation 的依据。

### 3.C.2 Mutation-Specific Minimum Evidence

| Mutation Type | Minimum Sufficient Evidence | Insufficient Evidence |
|---|---|---|
| Character current location | 明确到达、被目击在场、场景明确切换到该角色所在地点 | 准备去、朝某处走、打算进入、别人推测其在场 |
| Item holder | 明确交付、明确拿到、明确持有、明确保管 | 提到物品、接近物品、知道物品位置 |
| Item owner | 明确所有权转让、归属声明、购买 / 继承 / 授权等 ownership 证据 | 拿着、代管、保管、暂时携带 |
| CharacterKnowledge `unaware → suspects` | 角色接触到异常、线索或不完整信息，并表现出怀疑 | 读者知道、其他角色知道、旁白暗示但该角色无接触 |
| CharacterKnowledge `suspects → believes` | 角色形成明确主观判断，哪怕可能是 false belief | 模糊不安、暂时疑惑、未落定猜测 |
| CharacterKnowledge `believes → knows` | 直接披露、直接观察、权威确认、可验证证据被角色掌握 | 道听途说、传闻、强推断 |
| WorldTruth update | 叙事层明确确证，或权威 source 确认 | 角色声称、谣言、误导性 dialogue |
| Relationship structural | 明确关系声明、档案、契约、身份揭示 | 亲密互动、保护行为、语气变化 |
| Relationship operational | 明确合作、授权、临时结盟、条件性配合 | 心理缓和、愿意听对方说话 |
| PlotThread resolved | thread core question 被真正回答 | 线索变强、读者可猜到、角色接近答案 |
| Current status alive/dead | 当前时点明确在世 / 死亡证据 | 历史上仍活着、三天前出现过、别人以为还活着 |

### 3.C.3 Evidence Granularity

证据应尽量锚定到：

- source chapter。
- 原文片段或段落范围。
- 说话人或观察者。
- 叙事视角。
- 与 proposed after 的直接关系。

证据粒度不足时，即使方向合理，也应转为 `NEEDS_REVIEW` 或 `REJECT`。

### 3.C.4 Strong Inference Is Not Enough for Hard State

强推断可以产生：

```text
Soft Interpretation
Review signal
Candidate delta
```

但不能直接支持 high-risk Hard State mutation，例如：

- ownership change。
- knowledge reveal。
- identity confirmation。
- plot thread resolution。
- psychological relationship hardening。
- timeline-sensitive current status。

---

## 3.D Knowledge Boundary Validation

Knowledge Boundary Validation 防止 World Truth、Character Knowledge 与 Reported Proposition 互相污染。

### 3.D.1 Three Separate Layers

Validator 必须区分：

| Layer | Meaning |
|---|---|
| World Truth | 命题 P 在故事世界中是否为真 |
| Character Knowledge | 某角色对 P 当前持有什么认知 stance |
| Reported Proposition | "X 声称 P"这个报告行为本身 |

### 3.D.2 Reported Proposition Rule

```text
X claims P
```

不能自动推出：

```text
WorldTruth[P] = confirmed_true
CharacterKnowledge[Y, P].stance = knows
```

它最多直接支持：

```text
Event: X claimed P
Proposition: X claimed P
CharacterKnowledge[Y, X_claimed_P].stance = knows / believes
```

是否进一步支持 `P` 本身，取决于 source reliability、叙事确认、角色是否有额外证据，以及当前 contract 允许的证据门槛。

### 3.D.3 Stance Transition Rules

| Transition | Allowed When | Not Allowed When |
|---|---|---|
| `unaware → suspects` | 角色接触到异常线索、不完整信息、矛盾现象 | 只有读者或其他角色知道 |
| `suspects → believes` | 角色形成明确判断，但不一定为真 | 只是继续困惑或泛泛怀疑 |
| `believes → knows` | 角色获得直接披露、直接观察或足够强的验证 | 仅靠传闻、推断、情绪确信 |
| `believes(value=false) → believes(value=true)` | 新证据使角色明确改信另一值，但尚未达到 knows | 系统发现 world truth 变化但角色未接触证据 |
| `believes → suspects` | 角色原有信念被动摇，证据不足以确认新值 | 没有角色层面的动摇证据 |
| `knows → believes / suspects` | retcon、记忆被篡改、角色失去可靠依据等特殊情形，通常需人工审核 | 普通新证据只改变 world truth，不改变角色已经知道过的历史事实 |

### 3.D.4 False Belief

False belief 是合法状态：

```text
WorldTruth[P] = confirmed_false
CharacterKnowledge[A, P].stance = believes
CharacterKnowledge[A, P].believed_value = true
```

Validator 不得因为 `believed_value` 与 World Truth 不一致就自动拒绝。它应检查：

- false belief 是否有角色视角证据。
- believed_value 是否显式记录。
- 是否没有被误写入 WorldTruth。

### 3.D.5 Belief Correction

Belief correction 必须是显式 delta，而不是 silent overwrite。

合法 correction 应包含：

```text
before.stance
before.believed_value
after.stance
after.believed_value, if applicable
supporting basis
provenance
```

若 correction 是 Story-derived，还必须包含 source revision 与 textual Evidence anchor；若来自 Human Correction / Canonical Override / Retcon / Import Migration，则可由相应 correction basis / override provenance 支持，不强制要求 story-text evidence。

例如：

```text
CharacterKnowledge[林夏, P].stance: believes → knows
CharacterKnowledge[林夏, P].believed_value: true → false
```

`correction` 只能作为 transition / provenance metadata，不能写入 `stance`。只有当支持依据足以证明林夏完成认知更正时才允许。

---

## 3.E Relationship Validation

Relationship Validation 防止把心理解释、临时合作、结构关系混为一谈。

### 3.E.1 Relationship Classes

| Class | Canonical Hard State Eligibility | Examples |
|---|---|---|
| Structural | Eligible | 血缘、婚姻、组织隶属、师徒、契约、债务、监护 |
| Explicit Operational | Eligible with scope | 本次合作、临时停火、任务级协同、明确授权、条件性配合 |
| Psychological / Interpretive | Default not eligible | 信任、爱意、保护欲、戒备、愧疚、暧昧、敌意缓和 |

### 3.E.2 Scope-Bounded Declaration Rule

文本：

```text
"这一次我信你"
```

可以支持：

```text
RelationshipHard[A → B, explicit_bounded_cooperation_stance]
none → bounded_cooperation
scope = current_escape / current_operation / declared context
```

不能自动支持：

```text
RelationshipHard[A → B, long_term_trust]
distrust → trust
```

### 3.E.3 Directionality Rule

Relationship 默认有向。

```text
RelationshipHard[林夏 → 陈默, bounded_cooperation]
```

不能自动推出：

```text
RelationshipHard[陈默 → 林夏, bounded_cooperation]
```

除非证据明确覆盖双向。

### 3.E.4 Psychological Hardening Requires High Evidence

心理状态进入 Hard State 必须非常谨慎。通常应推荐：

```text
risk_level = HIGH
recommended_decision = NEEDS_REVIEW
```

除非 State Contract 明确存在某个 hard relationship field，且证据是明确、可范围化、可审计的声明。

---

## 3.F Plot Thread Validation

Plot Thread Validation 判断 thread 是否可以从 `open` 转为 `progressing`，或从 `progressing` 转为 `resolved`。

### 3.F.1 Allowed Statuses

```text
open
progressing
resolved
```

### 3.F.2 Status Transition Rules

| Transition | Allowed When | Not Allowed When |
|---|---|---|
| `open → progressing` | 出现新线索、行动推进、关键人物接近答案、thread scope 更清晰 | 只是重复旧问题 |
| `progressing → resolved` | thread core question 被真正回答，且答案可进入 canonical 或明确关闭 | 只有强暗示、读者可推断、人物尚未确认 |
| `open → resolved` | 核心问题在同一证据窗口内被完整提出并回答，通常需 review | 只是出现一个看似结论的片段 |
| `resolved → progressing/open` | retcon、后续证据推翻、人工重新打开 | 普通新线索增加细节但不推翻 closure |

### 3.F.3 Core Question Requirement

每个 plot thread 应有一个 core question。Validator 检查 resolved delta 时必须问：

```text
Does the evidence answer the thread's core question?
```

如果答案只是"很可能""几乎可以猜到""人物已经接近真相"，则不能 resolved，只能 progressing 或 needs_review。

### 3.F.4 Strong Inference ≠ Resolved

Strong inference 可以支持：

```text
PlotThread.status: open → progressing
```

但不能单独支持：

```text
PlotThread.status: progressing → resolved
```

---

## 3.G Temporal Validation

Temporal Validation 防止把历史事实、当前事实与未来动作混淆。

### 3.G.1 Temporal Classes

| Class | Meaning | Current State Eligibility |
|---|---|---|
| Historical Fact | 曾经发生或曾经成立 | 进入 Event Ledger；不自动改变 current state |
| Current Fact | 当前仍成立 | 可通过 Delta 进入 Canonical Current State |
| Future Intent | 准备、计划、将要、打算 | 通常不能作为已完成 current state |
| Conditional Future | 如果 X 则 Y | 不作为 current state，除非条件已满足并有证据 |

### 3.G.2 Historical Alive ≠ Current Alive

```text
"三天前仍活着"
```

不能推出：

```text
Character.current_status = alive
```

它只能支持历史事实或 event：

```text
Event: Character was alive three days ago
```

除非存在当前时点的明确存活证据。

### 3.G.3 Future Intent ≠ Completed State

```text
"准备进入排水通道"
"朝排水通道走去"
```

不能推出：

```text
Character.current_location = Drainage Passage
```

可以支持：

```text
Event: Character intended to enter Drainage Passage
PlotThread / action state: progressing, if contract allows
```

### 3.G.4 Source Order First

在 V0.2.1 语义下，source order 是基础时间序；story-time 是可选附加层。Validator 应避免用模糊 story-time 覆盖已提交的 newer canonical version。

---

## 3.H Event vs State Validation

Event vs State Validation 防止 Event Ledger 与 Current State 互相越权。

### 3.H.1 Append Event Is Not State Mutation

Append Event 只表示：

```text
something happened / was said / was reported / was revealed
```

它不表示：

```text
Current State has changed
```

### 3.H.2 Story Event Path

当 Story Event 导致状态变化时，必须走：

```text
Evidence
→ Append Event
→ Derive Event Effect
→ Propose Delta
→ Validate
→ Conflict Check
→ Decision
→ Commit
```

### 3.H.3 Non-Event Patch Path

Human Correction / Retcon / Canonical Override / Import Migration 可以直接提出 Delta，不要求 story-text evidence，但必须提供可审计的 human decision、migration source、correction basis 或 override provenance，并仍必须走：

```text
Propose Delta
→ Validate
→ Conflict Check
→ Decision
→ Commit
```

### 3.H.4 Forbidden Pattern

禁止：

```text
Event entity absent → created as Hard State
```

事件账本第一次出现某对象，不等于该对象已经有资格进入 Canonical Current State。

---

## 4. Risk Model

Validator 使用四级风险：

```text
LOW
MEDIUM
HIGH
CONFLICT
```

风险级别不是置信度本身，而是 admission 风险：如果错 commit，会对 continuity、审计或后续生成造成多大损害。

### 4.1 LOW

**定义**：结构明确、证据直接、before-state 对齐、mutation 低影响、无跨层语义偷换。

**触发条件**：

- Schema valid。
- `delta.before` 精确匹配 current canonical value。
- Evidence 直接支持 mutation。
- 不涉及 identity、ownership、knowledge reveal、relationship psychology、thread resolution、timeline-sensitive current status。
- 没有与现有 canonical state 或其他 pending delta 冲突。

**推荐 Decision**：

```text
AUTO_ACCEPT_ELIGIBLE
```

**Example**：明确交付导致 `Item[USB].holder: 陈默 → 林夏`，且 owner no-change 被正确保留。

### 4.2 MEDIUM

**定义**：结构合法、证据较强，但涉及需要保留 scope、basis、epistemic status 或可能被误外推的状态。

**触发条件**：

- location 当前状态由明确移动 / 到达支持，但时间窗口接近边界。
- plot thread 从 `open → progressing`。
- character knowledge 从 `unaware → suspects` 或 `suspects → believes`。
- explicit operational relationship，需要 scope 限定。
- holder / custodian 变化但 ownership 不变。

**推荐 Decision**：

```text
AUTO_ACCEPT_ELIGIBLE or NEEDS_REVIEW
```

具体取决于证据是否直接、scope 是否明确、是否存在 competing deltas。

### 4.3 HIGH

**定义**：即使 schema 与 before-state 通过，mutation 仍可能造成高影响误写，需要人工关注证据强度与语义边界。

**触发条件**：

- identity reveal。
- ownership change。
- `believes → knows`。
- false belief correction。
- WorldTruth update。
- PlotThread `progressing/open → resolved`。
- long-term relationship trust / betrayal / loyalty 等心理硬化。
- 当前生死、当前位置等 timeline-sensitive state。
- Retcon、override、human correction 影响既有 canonical truth。

**推荐 Decision**：

```text
NEEDS_REVIEW
```

除非系统产品明确允许某些 high-risk delta 自动通过，否则默认转人工。

### 4.4 CONFLICT

**定义**：delta 与当前 canonical state、before-state、证据集合或其他 pending/accepted delta 存在不可静默合并的冲突。

**触发条件**：

- `delta.before` 与当前 canonical value 不一致。
- proposed after 与现有 canonical state 互斥。
- 两条 pending delta 对同一 target.path 提出不同 after。
- evidence 互相矛盾，且无法通过 source order / authority / retcon policy 解决。
- 较旧 evidence 试图覆盖较新 canonical state。
- 同一角色 knowledge 被同时提议为 `unaware` 与 `knows`，且 basis 冲突。

**推荐 Decision**：

```text
CONFLICT
```

CONFLICT 必须阻止 silent commit，并要求人工或重新生成 delta。

---

## 5. Decision Model

### 5.1 Recommendation Values

Validator 使用以下推荐值：

| Recommendation | Meaning | Typical Risk |
|---|---|---|
| `AUTO_ACCEPT_ELIGIBLE` | 可进入自动接受候选；仍需记录 Delta Decision | LOW / selected MEDIUM |
| `NEEDS_REVIEW` | 需要人工审核证据、边界或影响范围 | MEDIUM / HIGH |
| `REJECT` | 不应进入 canonical；通常是 schema invalid 或 evidence insufficient | Any non-conflict failure |
| `CONFLICT` | 存在 stale before 或 canonical conflict；禁止 silent commit | CONFLICT |

### 5.2 Final Delta Decisions

最终 Delta Decision 仍是：

```text
accepted
rejected
needs_review
deferred
```

它们与 Validator recommendation 的关系：

| Validator Recommendation | Possible Final Decision | Notes |
|---|---|---|
| `AUTO_ACCEPT_ELIGIBLE` | `accepted / deferred` | accepted 前仍应生成 decision record |
| `NEEDS_REVIEW` | `accepted / rejected / needs_review / deferred` | 人工或更高层流程决定 |
| `REJECT` | `rejected / deferred` | deferred 仅用于等待缺失 evidence 或 schema 修正 |
| `CONFLICT` | `needs_review / deferred / rejected` | 不允许直接 accepted，除非 conflict 被显式解决并生成新 delta |

### 5.3 Recommendation Logic

简化决策逻辑：

```text
if missing required delta fields:
  REJECT
else if schema invalid:
  REJECT
else if before != current canonical value:
  CONFLICT
else if direct contradiction with canonical state:
  CONFLICT
else if evidence insufficient for mutation type:
  REJECT or NEEDS_REVIEW
else if boundary violation detected:
  REJECT or NEEDS_REVIEW
else if risk == HIGH:
  NEEDS_REVIEW
else if risk == MEDIUM and scope/evidence are clear:
  AUTO_ACCEPT_ELIGIBLE
else if risk == MEDIUM:
  NEEDS_REVIEW
else:
  AUTO_ACCEPT_ELIGIBLE
```

### 5.4 Reject vs Needs Review

Use `REJECT` when the proposed mutation is clearly unsupported or illegal:

- illegal enum。
- illegal field path。
- `location = "Unknown"` as domain value。
- reported proposition directly written as World Truth。
- possession-only evidence used for ownership change。
- future intent used as completed current location。

Use `NEEDS_REVIEW` when the mutation might be valid but requires judgment:

- evidence is ambiguous but potentially sufficient。
- high-risk knowledge reveal。
- relationship statement may be scope-bounded。
- thread resolution may depend on core question interpretation。
- retcon / override has product implications。

### 5.5 NO_CHANGE Decision and Versioning

`NO_CHANGE` 可被记录为已评估的 delta decision，但不会 apply Canonical mutation。其审计记录应关联 `evaluated_against_version`，并保留 evidence / provenance、reason 与 decision。

版本规则：

```text
if commit_batch contains accepted canonical mutation:
  create next State Version
else if commit_batch contains only NO_CHANGE:
  do not create State Version
  do not increment State Version
```

---

## 6. Benchmark Case Mapping

本节按 `STORYSTATE_BENCHMARK_PILOT_V0.2.2` 的 Ch13–Ch17 典型 case 映射 Validator 行为。每个 case 使用同一结构：Input Delta、Evidence、Validator checks、Risk、Recommended Decision、Reason。

---

### 6.1 Ch13 — USB Holder Change

**Input Delta**

```text
operation: UPDATE
target: Item[USB]
path: holder
before: 陈默
after: 林夏
evidence: Ch13 陈默将 USB 放入林夏手中，并让她保管
reason: 明确 handoff / possession transfer
```

**Evidence**

Ch13 明确发生 USB handoff：陈默把 USB 交到林夏手中，并表达保管语义。

**Validator Checks**

| Check | Result |
|---|---|
| Schema Validation | Pass：`Item[USB].holder` 是合法 path；`UPDATE` 合法 |
| Before-State Validation | Pass if current holder = 陈默 |
| Evidence Sufficiency | Pass：明确交付 / 持有支持 holder change |
| Knowledge Boundary | Not applicable |
| Relationship Boundary | Not applicable |
| Temporal Boundary | Pass：这是当前持有状态变化，不是未来意图 |
| Event vs State | Pass if represented as Event Effect → Delta |
| Conflict Check | Pass if no competing holder delta |

**Risk**

```text
LOW to MEDIUM
```

MEDIUM 仅因为 item possession 对 continuity 有影响；但证据直接、scope 清晰。

**Recommended Decision**

```text
AUTO_ACCEPT_ELIGIBLE
```

**Reason**

证据直接支持 holder 从陈默变为林夏；该 mutation 不要求 ownership 变化，也没有 knowledge 或 timeline 边界风险。

---

### 6.2 Ch13 — USB Owner No-Change

**Input Delta**

```text
operation: NO_CHANGE
target: Item[USB]
path: owner
before: 陈默
after: 陈默
evidence: Ch13 陈默将 USB 交给林夏保管
reason: 交付保管只支持 holder change，不支持 ownership transfer
```

**Evidence**

文本支持 possession / custody handoff，但没有明确所有权转让。

**Validator Checks**

| Check | Result |
|---|---|
| Schema Validation | Pass：`Item[USB].owner` 合法；`NO_CHANGE` 合法 |
| Before-State Validation | Pass if current owner = 陈默 |
| Evidence Sufficiency | Pass for no-change；Fail for any owner-change delta |
| Event vs State | Pass：event effect 只产生 holder update，不产生 owner update |
| Conflict Check | Pass if no canonical override states otherwise |

**Risk**

```text
LOW
```

**Recommended Decision**

```text
AUTO_ACCEPT_ELIGIBLE
```

**Reason**

物理持有不是所有权。Validator 应阻止将"拿着 / 保管"升级为 ownership change。

---

### 6.3 Ch13 — Knowledge Mapping：Q Suspects ≠ P Knows

正式区分两个 proposition：

```text
P = "陈默是市刑侦支队警察，并正在港务安保中卧底"
Q = "陈默的公开身份不完整"
```

**Input Delta**

```text
operation: UPDATE
target: CharacterKnowledge[林夏, Q]
path: stance
before: no stated suspicion
after: suspects
supporting basis:
  source revision: Ch13
  textual evidence anchor: 林夏接触到 USB 或异常线索，并意识到陈默的公开身份不完整
reason: 线索支持对 Q 产生怀疑，但不披露完整身份命题 P
```

同时必须记录 / 验证：

```text
NO_CHANGE CharacterKnowledge[林夏, P].stance = unaware
```

**Evidence**

Ch13 的异常线索支持林夏对 Q——“陈默的公开身份不完整”——从无明确怀疑转为 `suspects`。它不支持林夏知道、相信或怀疑完整命题 P。

**Validator Checks**

| Check | Result |
|---|---|
| Schema Validation | Pass：Q 与 P 是分别寻址的 proposition；`suspects` 合法 |
| Before-State Validation | Pass if 林夏对 Q 的 before 为 no stated suspicion，且对 P 的 canonical stance 为 `unaware` |
| Evidence Sufficiency | Pass for Q `no stated suspicion → suspects`；Fail for any P stance mutation |
| Knowledge Boundary | Pass only if Q 的怀疑不传播到 P；`suspects ≠ knows` |
| Event vs State | Pass if Ch13 线索经 Event Effect 提出 Q delta |
| Conflict Check | Reject any competing delta that changes 林夏对 P 的 `unaware` without separate sufficient basis |

**Risk**

```text
MEDIUM
```

**Recommended Decision**

```text
AUTO_ACCEPT_ELIGIBLE or NEEDS_REVIEW
```

**Reason**

对“公开身份不完整”的怀疑不等于知道“刑侦警察且正在卧底”的完整身份。正式身份命题 P 必须保持 `unaware`；Q 的 `no stated suspicion → suspects` 不得传播到 P。

---

### 6.4 Ch14 — 陈默 Location Unresolved

**Input Delta**

```text
operation: UPDATE
target: Character[陈默]
path: current_location epistemic status / last_confirmed_location
before:
  location: Hospital
after:
  current location epistemic status: unresolved
  last_confirmed_location: Hospital
supporting basis:
  source revision: Ch14
  textual evidence anchor: 陈默签字离院，没有留下去向
reason: 离开最后确认地点后去向未明
```

**Evidence**

Ch14 明确写明陈默签字离院，且没有留下去向。最后确认地点是 `Hospital`；当前地点只能记为 epistemic `unresolved`。人物不是林夏，地点不是 `Hospital Gate`。

**Validator Checks**

| Check | Result |
|---|---|
| Schema Validation | Pass only if unresolved 被表达为 current location epistemic status，而非名为 `Unknown` 的地点值 |
| Before-State Validation | Pass if 陈默 before location = `Hospital` |
| Evidence Sufficiency | Pass：签字离院且无去向支持 current location unresolved，并保留 `last_confirmed_location = Hospital` |
| Temporal Boundary | Pass：没有把离院意图或未知去向虚构为具体当前位置 |
| Entity / Value Mapping | Pass only for Character[陈默] and `Hospital`；林夏 / `Hospital Gate` 均为错误映射 |
| Conflict Check | Check whether later source already confirms 陈默 location |

**Risk**

```text
MEDIUM
```

**Recommended Decision**

```text
NEEDS_REVIEW or AUTO_ACCEPT_ELIGIBLE
```

**Reason**

`unresolved` 是当前位置的 epistemic status，不是地点值。该 delta 必须保留陈默最后确认在 `Hospital`，且不得替换为错误人物或错误地点。

---

### 6.5 Ch14 — Reported Proposition

**Input Delta**

```text
operation: UPDATE
target: WorldTruth[P]
path: status
before: unresolved
after: confirmed_true
evidence: Ch14 何叔声称 P
reason: 何叔说 P，因此 P 为真
```

**Evidence**

Ch14 支持"何叔声称 P"这个 reported proposition；不自动支持 P 本身为世界真相。

**Validator Checks**

| Check | Result |
|---|---|
| Schema Validation | Pass if WorldTruth path/status legal |
| Before-State Validation | Pass only if before matches |
| Evidence Sufficiency | Fail：claim evidence 不足以确认 WorldTruth[P] |
| Knowledge Boundary | Fail：reported proposition 被错误提升为 world truth |
| Event vs State | Fail if claim event directly mutates world truth |

**Risk**

```text
HIGH
```

WorldTruth update 是高风险 mutation。

**Recommended Decision**

```text
REJECT
```

Alternative valid delta：

```text
CREATE/UPDATE Proposition[HeShu_claimed_P]
UPDATE CharacterKnowledge[listener, HeShu_claimed_P].stance: unaware → knows/believes
NO_CHANGE WorldTruth[P]
```

**Reason**

"X 声称 P"与"P 为真"是两个不同命题；reported proposition 不能自动成为 World Truth。

---

### 6.6 Ch15 — False Belief

正式 proposition：

```text
P = "林夏父亲三天前亲自到 C-19，并亲手留下残页"
```

**Input Delta**

```text
operation: UPDATE
target: CharacterKnowledge[林夏, P]
path: stance / believed_value
before:
  stance: no belief
after:
  stance: believes
  believed_value: true
supporting basis:
  source revision: Ch15
  textual evidence anchor: 林夏基于误导性线索形成 P 为真的明确判断
reason: 角色形成主观确信；hidden author truth 不得作为 Canonical State 输入
```

并保持：

```text
NO_CHANGE CanonicalWorldTruth[P].status = unresolved
hidden_author_truth = false  # 非 Canonical State 输入
```

**Evidence**

Ch15 支持林夏从 no belief 形成 `believes(true)`。`hidden_author_truth = false` 仅说明这是 false belief 的作者侧隐藏真相，不得写入 Canonical State；正式 World Truth 仍为 `unresolved`。

**Validator Checks**

| Check | Result |
|---|---|
| Schema Validation | Pass：`believes` 与 `believed_value = true` 合法 |
| Before-State Validation | Pass if 林夏对 P 的 before = no belief |
| Evidence Sufficiency | Pass if story evidence shows 林夏明确相信 P 为真 |
| Knowledge Boundary | Pass only if `CanonicalWorldTruth[P]` remains `unresolved` |
| Hidden Author Truth Boundary | Pass only if `hidden_author_truth = false` is excluded from Canonical State input |
| Conflict Check | Pass：Character belief 可与 unresolved World Truth 并存 |

**Risk**

```text
MEDIUM to HIGH
```

**Recommended Decision**

```text
NEEDS_REVIEW
```

**Reason**

正式 transition 是 `no belief → believes(true)`，绝不是 `suspects → believes(false)`。角色信念不确认 World Truth，隐藏作者真相也不能越权成为 Canonical State 输入。

---

### 6.7 Ch15 — 货单残页 Owner Unresolved

**Input Delta**

```text
operation: UPDATE
target: Item[货单残页]
path: owner / holder
before:
  owner:
    value: null
    epistemic status: unresolved
  holder: null or prior canonical holder
after:
  owner:
    value: null
    epistemic status: unresolved
  holder: 林夏
supporting basis:
  source revision: Ch15
  textual evidence anchor: 林夏发现、封装并持有货单残页，文本未给出所有权归属
reason: possession / custody change does not establish ownership
```

USB 状态继续保持：

```text
NO_CHANGE Item[USB].owner = 陈默
NO_CHANGE Item[USB].holder = 林夏
```

**Evidence**

Ch15 支持林夏发现、封装、持有货单残页；这些行为支持 `holder = 林夏`，不支持获得 ownership。货单残页 owner 必须保持 `value = null, epistemic status = unresolved`。

**Validator Checks**

| Check | Result |
|---|---|
| Schema Validation | Pass：对象是 `Item[货单残页]`；owner unresolved 使用 `value + epistemic status`，不是字符串 `Unknown` |
| Before-State Validation | Pass only if owner 与 holder before 匹配当前 canonical state |
| Evidence Sufficiency | Pass for holder = 林夏；Fail for any ownership assignment |
| Ownership Boundary | Pass only if 发现 / 封装 / 持有不被解释为 ownership transfer |
| Item Mapping | Pass only if 本 case 不误用 USB；USB owner = 陈默、holder = 林夏保持不变 |
| Conflict Check | Check no canonical ownership source exists for 货单残页 |

**Risk**

```text
MEDIUM for holder; HIGH for any proposed owner assignment
```

**Recommended Decision**

```text
AUTO_ACCEPT_ELIGIBLE or NEEDS_REVIEW
```

用于 holder 更新与 owner unresolved 保持；任何把林夏写为 owner 的 delta 均应 `REJECT`。

**Reason**

发现、封装、持有货单残页不等于获得其 ownership。本 case 的对象是货单残页，不是 USB。

---

### 6.8 Ch16 — Asymmetric Knowledge

**Input Delta**

```text
operation: UPDATE
target: CharacterKnowledge[顾言, P]
path: stance
before: unaware
after: knows
evidence: Ch16 陈默只向顾言 direct disclosure，并允许 credential inspection
reason: 顾言获得直接披露与可验证凭据
```

**Evidence**

Ch16 中 direct disclosure 与 credential inspection 只发生在顾言链路上。林夏未获得 P。

**Validator Checks**

| Check | Result |
|---|---|
| Schema Validation | Pass：stance enum legal |
| Before-State Validation | Pass if 顾言 current stance = unaware |
| Evidence Sufficiency | Pass：direct disclosure + credential inspection supports knows |
| Knowledge Boundary | Pass：只更新顾言，不传播到林夏 |
| Conflict Check | Pass if no competing knowledge state |

**Risk**

```text
HIGH
```

identity / undercover knowledge reveal is high-risk.

**Recommended Decision**

```text
NEEDS_REVIEW
```

如果系统策略允许明确 direct disclosure 自动进入，也可标记 `AUTO_ACCEPT_ELIGIBLE`，但默认 high-risk review 更安全。

**Reason**

同一 World Truth 可以对应不同 Character Knowledge。顾言 `unaware → knows` 合法；林夏必须保持 `unaware` 或对另一个命题维持 `suspects`，不能被自动同步。

---

### 6.9 Ch17 — Belief Correction

正式 proposition 沿用 Ch15：

```text
P = "林夏父亲三天前亲自到 C-19，并亲手留下残页"
```

**Input Delta**

```text
operation: UPDATE
target: CanonicalWorldTruth[P]
path: status
before: unresolved
after: confirmed_false
supporting basis:
  source revision: Ch17
  textual evidence anchor: Ch17 对 P 给出 canonical-level 否定确认
```

```text
operation: UPDATE
target: CharacterKnowledge[林夏, P]
path: stance / believed_value
before:
  stance: believes
  believed_value: true
after:
  stance: knows
  believed_value: false
transition metadata: correction
supporting basis:
  source revision: Ch17
  textual evidence anchor: 林夏获得足以确认 P 为假的直接证据
reason: 新证据纠正原有 believes(true)，形成 knows(false)
```

**Evidence**

Ch17 同时支持 World Truth 从 `unresolved → confirmed_false`，以及林夏从 `believes(true) → knows(false)`。`correction` 只记录 transition / provenance metadata，不是 stance。

**Validator Checks**

| Check | Result |
|---|---|
| Schema Validation | Pass：World Truth status 与 CharacterKnowledge stance / believed_value 均合法；`correction` 未写入 stance |
| Before-State Validation | Pass only if World Truth before = `unresolved`，林夏 before = `believes(true)` |
| Evidence Sufficiency | Pass if Ch17 basis 分别支持 canonical falsity 与林夏可访问的直接纠正证据 |
| Knowledge Boundary | Pass：World Truth 与角色认知分别提交，不依赖自动传播 |
| Transition Direction | Pass only for `believes(true) → knows(false)`；禁止 `believes(false) → knows(true)` |
| Conflict Check | Check against prior CharacterKnowledge ledger and CanonicalWorldTruth history |

**Risk**

```text
HIGH
```

**Recommended Decision**

```text
NEEDS_REVIEW
```

**Reason**

belief correction 必须显式记录 before、after、believed_value、supporting basis 与 provenance。正式结果是 World Truth `confirmed_false`、林夏 `knows(false)`；`correction` 不是第五种 stance。

---

### 6.10 Ch17 — Plot Thread Resolved

**Input Delta**

```text
operation: RESOLVE
target: PlotThread[Core Mystery]
path: status
before: progressing
after: resolved
evidence: Ch17 thread core question 被真正回答
reason: 核心悬念已经获得明确答案
```

**Evidence**

Ch17 明确回答 thread core question，而不只是提供强线索。

**Validator Checks**

| Check | Result |
|---|---|
| Schema Validation | Pass：`resolved` 是合法 status；`RESOLVE` 合法 |
| Before-State Validation | Pass if current status = progressing |
| Evidence Sufficiency | Pass only if core question is actually answered |
| Plot Thread Boundary | Pass：strong inference is not the basis; actual answer is |
| Temporal Boundary | Pass if resolution belongs to current source order |
| Conflict Check | Check no unresolved canonical dependency remains |

**Risk**

```text
HIGH
```

thread closure 对后续 context pruning 与 story planning 影响大。

**Recommended Decision**

```text
NEEDS_REVIEW
```

**Reason**

Plot Thread resolved 只有在核心问题真正被回答时成立。若只是强推断，应改为 `progressing` 而非 `resolved`。

---

### 6.11 Ch17 — Bounded Cooperation

**Input Delta**

```text
operation: UPDATE
target: RelationshipHard[林夏 → 陈默, explicit_bounded_cooperation_stance]
path: value
before: none
after: bounded_cooperation
status: active
evidence: Ch17 林夏表达"这一次我信你"并按当前逃离 / 行动场景配合
reason: 明确、有限范围的 operational cooperation
```

**Evidence**

Ch17 支持当前场景下的 bounded cooperation，不支持 long-term trust repair。

**Validator Checks**

| Check | Result |
|---|---|
| Schema Validation | Pass if hard relationship field exists and supports scoped stance |
| Before-State Validation | Pass if current bounded cooperation = none |
| Evidence Sufficiency | Pass for operational cooperation |
| Relationship Boundary | Pass only if scope is recorded；Fail if long-term trust is changed |
| Conflict Check | Check existing long-term trust remains `distrust` |

**Risk**

```text
MEDIUM
```

operational stance 有 hard-state 价值，但需要 scope 限定。

**Recommended Decision**

```text
AUTO_ACCEPT_ELIGIBLE
```

前提是 delta 明确保留：

```text
NO_CHANGE RelationshipHard[林夏 → 陈默, long_term_trust] = distrust
```

**Reason**

"这一次我信你"可以支持本次行动的有限合作立场，不能自动支持长期信任修复。

---

### 6.12 Ch17 — Historical Alive ≠ Current Alive

**Input Delta**

```text
operation: UPDATE
target: Character[某角色]
path: current_status
before: unresolved
after: alive
evidence: Ch17 提到该角色三天前仍活着
reason: 三天前活着，所以当前仍活着
```

**Evidence**

Ch17 只支持 historical alive，不支持 current alive。

**Validator Checks**

| Check | Result |
|---|---|
| Schema Validation | Pass if status enum legal |
| Before-State Validation | Pass only if before matches |
| Evidence Sufficiency | Fail for current_status = alive |
| Temporal Boundary | Fail：historical fact 被错误外推为 current fact |
| Event vs State | Pass only if represented as historical event, not current state mutation |

**Risk**

```text
HIGH
```

生死状态是 timeline-sensitive high-impact state。

**Recommended Decision**

```text
REJECT
```

Alternative valid output：

```text
Append Event: Character was alive three days ago
NO_CHANGE Character.current_status
```

或：

```text
Character.current_status = unresolved
last_confirmed_alive_at = three days ago
```

如果 contract 支持该结构。

**Reason**

历史事实不自动等于当前事实。"三天前仍活着"不能推出当前仍活着。

---

## 6.13 Benchmark Mapping Final Check

以下映射以 `STORYSTATE_BENCHMARK_PILOT_V0.2.2` 为冻结基准；Validator 不得改写其人物、命题、方向、对象或状态：

| Chapter | Required Mapping |
|---|---|
| Ch13 | P = “陈默是市刑侦支队警察，并正在港务安保中卧底”；林夏对 P 保持 `unaware`。Q = “陈默的公开身份不完整”；林夏对 Q：`no stated suspicion → suspects`，且不传播到 P |
| Ch14 | `Character[陈默]`：before `location = Hospital`；after `current location epistemic status = unresolved`，`last_confirmed_location = Hospital`；依据为陈默签字离院且未留去向 |
| Ch15 | P = “林夏父亲三天前亲自到 C-19，并亲手留下残页”；`CanonicalWorldTruth[P] = unresolved`；林夏 `no belief → believes(true)`；`hidden_author_truth = false` 不进入 Canonical State |
| Ch15 | `Item[货单残页].owner = {value: null, epistemic status: unresolved}`；holder = 林夏。USB 继续保持 owner = 陈默、holder = 林夏 |
| Ch16 | 对 Ch13 身份命题 P：顾言 `knows`；林夏 `unaware` |
| Ch17 | 对 Ch15 命题 P：World Truth `unresolved → confirmed_false`；林夏 `believes(true) → knows(false)`；`correction` 仅为 transition / provenance metadata |
| Ch17 | `RelationshipHard[林夏 → 陈默, long_term_trust] = distrust` 为 `NO_CHANGE`；bounded cooperation = `active`，且 scope 有界 |

Final check 结论：以上映射不存在方向写反、人物写错或 item 写错；任何后续 proposal 与此表不一致时，必须按 conflict / boundary rules 阻止 silent commit。

---

## 7. Invariants

1. **Schema-valid does not mean evidence-valid.** 结构合法不代表证据足够。
2. **Evidence-valid does not mean conflict-free.** 证据足够不代表 before-state 或 canonical conflict 已解决。
3. **Validator recommends; Delta Decision decides.** Validator 只能推荐，不能提交。
4. **LLM output cannot directly mutate Canonical State.** LLM 只能 propose delta。
5. **All Canonical State mutations must go through State Delta.** 无论来源是 Event Effect、Human Correction、Retcon 还是 Migration。
6. **Stale before must block silent commit.** `delta.before` 与 current canonical 不一致时必须标记 conflict。
7. **Append Event never directly mutates Canonical State.** Event append 只进入 Event Ledger。
8. **Story Event effects must become Delta before commit.** Event 造成状态变化时必须走 Event Effect → Delta。
9. **Reported proposition is not World Truth.** "X 声称 P"不等于 P confirmed true。
10. **World Truth does not auto-propagate into Character Knowledge.** 世界为真不代表每个角色知道。
11. **Character Knowledge does not auto-propagate into World Truth.** 角色相信不代表世界为真。
12. **Character Knowledge stance set is closed.** 合法 stance 只有 `unaware / suspects / believes / knows`。
13. **False belief is valid state.** `believed_value` 可以与 WorldTruth 不一致。
14. **Belief correction must be explicit.** 更正认知必须保留 before、after、supporting basis 与 provenance；`correction` 只是 transition / provenance metadata，不是 stance。
15. **Physical possession is not ownership.** holder / custodian / owner 必须分开验证。
16. **Unknown is not a domain value.** `unknown / unresolved` 是 epistemic condition，不是 location、owner 等普通值。
17. **Future intent is not completed state.** "准备去 / 朝某处走"不等于已经到达。
18. **Historical truth is not automatically current truth.** "三天前仍活着"不等于当前 alive。
19. **Psychological interpretation is not automatically Hard State.** 心理推断默认进入 Soft Interpretation。
20. **Bounded cooperation is not long-term trust.** "这一次我信你"不自动修复长期信任。
21. **Relationship edges are directed by default.** A 对 B 的关系不自动镜像为 B 对 A。
22. **Strong inference is not resolved.** Plot Thread resolved 必须真正回答 core question。
23. **Older evidence cannot silently overwrite newer canonical state.** 较旧证据不能静默覆盖较新版本。
24. **No delta without target / path / operation / before / after / supporting basis / provenance.** 缺少基础字段或 provenance 即不可提交。
25. **Story-derived deltas require textual evidence.** 必须同时提供 source revision 与 textual Evidence anchor。
26. **Non-story patches do not require story-text evidence.** Human Correction / Canonical Override / Retcon / Import Migration 可由 human decision、migration source、correction basis 或 override provenance 支持。
27. **No bare mutation.** 无论来源为何，都禁止无 provenance 的裸 mutation。
28. **NO_CHANGE is not a Canonical mutation.** 它可进入 Delta Ledger / Validation Audit，但不得 apply state mutation。
29. **NO_CHANGE-only batches do not version state.** 单独 `NO_CHANGE` 或仅含 `NO_CHANGE` 的 commit batch 不创建新 State Version，版本号不递增。

---

## 8. V1 Deferred Rules

以下规则不在 V0.1 Rulebook 中展开，只保留为 V1 待设计项：

1. **User Lock / Canonical Override Priority**：用户确认状态是否可加锁、如何解锁、如何与 later evidence 冲突。
2. **Retcon Re-evaluation Policy**：rewrite / retcon 触发哪些历史 delta 重新验证，是否自动生成 superseding deltas。
3. **Cross-Chapter Batch Validation**：多章同时 ingest 时如何排序、合并、拆分互相影响的 deltas。
4. **Pending Delta Conflict Resolution**：多个 pending delta 指向同一 target.path 时的队列策略与人工界面。
5. **Evidence Authority Model**：不同叙事视角、角色谎言、旁白可靠性、文件证据的权重规则。
6. **Identity Resolution Gate**：新角色、新 alias、新组织、新物品的 identity merge / split 规则。
7. **Granular Temporal Model**：story-time 与 source order 并存时的更细时间推理机制。
8. **Soft Interpretation Promotion Policy**：极少数心理状态何时可从 Soft Interpretation 晋升为 Hard State。
9. **State Rollback and Revalidation**：restore 生成新 state version 后，旧 pending deltas 如何处理。
10. **Automated Threshold Tuning**：不同风险级别是否可随项目成熟度调整自动接受阈值。
11. **Review UX Taxonomy**：人工审核界面中如何展示 failed checks、evidence、before mismatch 与 recommended fixes。
12. **Canonical Object Creation Policy**：非 Event 来源与 Event 来源的 CREATE admission 细则。

---

## 9. Open Questions

1. LOW / MEDIUM 中哪些 mutation 类型允许 `AUTO_ACCEPT_ELIGIBLE`，是否应由项目配置控制？
2. `CharacterKnowledge[*, P].stance = knows` 是否永远 HIGH，还是 direct disclosure + credential inspection 可在部分项目中自动接受？
3. owner / holder / custodian 的 epistemic status 是否需要统一结构，例如 `value + status + last_confirmed_value + provenance`？
4. Plot Thread 的 core question 是否必须在 thread 创建时结构化记录？如果没有 core question，resolved 是否一律转人工？
5. 对 reported proposition，是否需要标准 proposition linking 结构来表达 `X claimed P` 与 `P` 的关系？
6. 对 false belief，`believed_value` 是否必须支持非布尔值、部分命题值或多候选值？
7. Relationship hard fields 的白名单应由 State Contract 固定，还是由 story/project profile 扩展？
8. Timeline-sensitive fields 的列表是否需要明确枚举，例如 current_location、current_status、current_holder、active_relationship、open_thread？
9. Conflict 状态下是否允许人工直接 accept 原 delta，还是必须生成 superseding delta？
10. V1 是否需要为 "deferred due to insufficient evidence" 建立重新触发机制？

---

## V0.1 → V0.1.1 CHANGELOG

- 修正 Ch13 Knowledge Mapping：拆分正式身份命题 P 与公开身份不完整命题 Q；林夏对 P 保持 `unaware`，仅对 Q 从 no stated suspicion 转为 `suspects`。
- 修正 Ch14 Location Unresolved：人物改为陈默；before 地点改为 `Hospital`；after 为 current location epistemic `unresolved`，并保留 `last_confirmed_location = Hospital`。
- 修正 Ch15 False Belief：正式 P 改为“林夏父亲三天前亲自到 C-19，并亲手留下残页”；林夏 `no belief → believes(true)`；World Truth 保持 `unresolved`；隐藏作者真相不进入 Canonical State。
- 修正 Ch15 Owner Unresolved：对象改为货单残页；owner 保持 `{value: null, epistemic status: unresolved}`，holder 为林夏；USB 保持 owner 陈默、holder 林夏。
- 修正 Ch17 Belief Correction：World Truth `unresolved → confirmed_false`；林夏 `believes(true) → knows(false)`；明确 `correction` 仅为 transition / provenance metadata。
- 统一 Validator Inputs、Completeness、Evidence Sufficiency 与 invariants 的 supporting basis / provenance 要求；非故事来源 patch 不再被强制要求 story-text evidence。
- 明确 `NO_CHANGE` 可进入 Delta Ledger / Validation Audit，但不是 Canonical mutation；NO_CHANGE-only batch 不创建新 State Version，版本不递增。
- 增加 Ch13–Ch17 Benchmark Mapping Final Check，确认命题方向、人物、物品与关系状态映射。

---

## End

`STORYSTATE_VALIDATOR_RULEBOOK_V0.1.1` 到此停止。
