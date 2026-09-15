# Stage 2.2.1A Benchmark Freeze and Evaluation Harness

Status: Stage 2.2.1A Benchmark + Eval Harness **COMPLETED / MERGED / FROZEN_BEFORE_LIVE_RUN**. **NOT live-run. Stage 2.2.1 overall is NOT complete. Stage 2.2.1B is NOT STARTED. Live Semantic Accuracy is NOT YET VALIDATED. No performance result is frozen or claimed.**

Base main: `f7f3b29e86723e1c43a381ffef49194ac631b379`. Astra benchmark/harness freeze: `ddfb19260853b441b11934420ec5bce4feab76dd`. Codex hardening and reviewed pre-live frozen commit for a future authorized live run: `fe620a3d8e36cf81d70d39c426a22783c555379a`. This provenance does not authorize a live run. Stage 1.3 / 2.1 / 2.1.2 / 2.2 remain completed and frozen. No production validator semantics, prompts, schema, frontend or Frozen Docs changed.

## Experimental Question

Do narrow specialists provide a real, safety-preserving capability improvement over one ordinary integrated semantic validator, at a defensible cost? This harness assumes neither architecture wins.

- Anchor: the ten existing Stage 2.2 cases, for sanity, regression and future provider compatibility only. They influenced existing design and must not be the primary architecture evidence.
- Holdout: 20 PO-defined candidates, five each in control/evidence/knowledge/temporal; exactly SUPPORTED 8, UNSUPPORTED 8, UNCERTAIN 4.
- Only eligible Holdout candidates that pass the actual frozen deterministicGate enter the comparison. A failed gate stops the entire run before any model call; there is no semantic-only bypass.
- Gold, definitions, evidence selection, stability IDs and pair metadata are committed before any live run. Changes after observing a live result require explicit PO authorization and a new benchmark version.

## Files and Freeze

- `tests/fixtures/live-semantic-benchmark.ts`: immutable metadata and reproducible source-bound candidate/packet builders.
- `tests/fixtures/live-semantic-benchmark.lock.json`: benchmark version, full dataset hash, packet/Gold fingerprint, source digest and evaluation configuration hash.
- `lib/eval/contract.ts`, `runner.ts`, `metrics.ts`: evaluation-only types, execution and report math.
- `tests/live-semantic-eval.test.ts`: deterministic harness tests.
- `scripts/eval-semantic-harness.ts`: mock-only CLI. No credentials, env loader or network/provider implementation.

Version: `stage-2.2.1/v0.1`; status: `FROZEN_BEFORE_LIVE_RUN`; frozenAt: 2026-09-15. This freezes the benchmark definition, not an experiment result. Dataset digest:

```text
992db12b706414bec4b9dadb2e591e1c220a90af6962853cb5b3d89af6dda53e
```

IDs are reproducible UUIDs derived from entity/event identities and exact chapter/span positions, not Gold labels or case difficulty. Existing random fixture IDs/timestamps are normalized only in evaluation copies. Gold and nested fixtures are deep-frozen; the collector does not write files or use a repository mutation API. The lock also detects changes to candidate inputs, sources, state snapshots, packet definitions, prompts, decoding and output schema.

The runner accepts an injected client; live clients are denied unless a later caller supplies explicit live authorization, expected configuration hash and a pre-run freeze commit SHA. Before any call, the runner resolves that exact commit in the local Git repository, reads the committed lock manifest, and requires its dataset/config hashes and case counts to match the evaluation. Caller-recomputed hashes and an arbitrary 40-hex value cannot authorize a mutated benchmark. A live adapter must report matching provider/model/version identity on every response or the run aborts. Product Owner authorization and provider credentials remain the future live-run caller's responsibility.

## Binding Method

Anchor packets retain the existing `runtimeFixture` data and semantics, with label-neutral IDs/timestamps and neutral fixture-note text. No existing test fixture is modified.

Holdouts use the frozen exact Pilot's canonical snapshots and source events. Independent evaluation copies contain the declared relevant Event evidence, not the whole previous candidate ledger. This prevents unrelated retrieval saturation from making a semantic comparison into a test of truncation policy. Canonical current truth remains the appropriate pre-transition snapshot; no post-transition result is substituted as evidence. All supplied quotes are literal spans in unchanged Ch13-17 Chapter Text.

Neutral packet projection removes fixture-author judgment from candidate reason/effect/basis notes. Group, description, Gold, rationale, pair metadata, stability selection and case IDs stay outside the model request.

Special cases:

- H06/H07 use the explicit D15-03 discovery checkpoint: the fragment exists, owner unresolved, holder not yet established. Then D15-05 tests the separate holder effect. This is a declared within-chapter fixture checkpoint, not a rewrite of the chapter-end fragment state. It avoids confusing a whole-item CREATE impact policy with a holder-only semantic comparison.
- H11 uses the post-Ch13 Q=suspects snapshot and the same maybe-clue; it proposes a further unsupported belief upgrade.
- H17 uses the post-Ch16 Maintenance Tunnel state; H16 uses the identical state mutation with Ch17 arrival evidence.
- H18 is a schema-valid NO_CHANGE candidate retaining resolved Hospital from the pre-Ch14 snapshot. The explicit departure makes this semantic assertion unsupported; it is not an illegal UPDATE that changes nothing.
- H10 uses the existing `RESOLVE` schema and a proposed `resolutionSupport.assessment=direct_answer`. That field is a claim to validate, not proof. The contract checks its shape and evidence IDs; the semantic layer must decide sufficiency.

## Holdout Bindings

S = SUPPORTED, U = UNSUPPORTED, ? = UNCERTAIN; A = AUTO_ACCEPT_ELIGIBLE, R = NEEDS_REVIEW. All 20 passed the real deterministicGate, both before packet creation and after ablation when applicable.

| Case | Group | Candidate / Frozen Binding | Gold |
| --- | --- | --- | --- |
| H01 | control | Chen Dock -> Hospital; D13-02 / E13-01 | S / A |
| H02 | control | USB encrypted -> index_unlocked; D14-03 / E14-05 | S / A |
| H03 | control | Lin C-19 -> Maintenance Tunnel; D16-01 / E16-05 | S / A |
| H04 | control | Chen Dock -> Home using Hospital observation; E13-01 | U / R |
| H05 | control | USB index_unlocked -> encrypted using decryption evidence; E17-01 | U / R |
| H06 | evidence | Fragment holder unresolved -> Lin; D15-03 checkpoint / E15-03 | S / A |
| H07 | evidence | Same fragment/evidence, owner unresolved -> Lin | U / R |
| H08 | evidence | explicit_operational / cooperation / current escape / active; E17-04 | S / R |
| H09 | evidence | Same record and evidence, scope general ongoing beyond current escape | U / R |
| H10 | evidence | USB Mystery progressing -> resolved, answer 周启明本人篡改记录; E17-02 ablation | ? / R |
| H11 | knowledge | Lin Q suspects -> believes(true); E13-03 | U / R |
| H12 | knowledge | Gu reported R unaware -> knows(true); K15-report-F / E15-02 | S / R |
| H13 | knowledge | Lin exact P unaware -> knows(true); E16-02/03/04/05 isolation/disclosure | U / R |
| H14 | knowledge | Lin same exact P unaware -> knows(true); K17-01 / E17-03 | S / R |
| H15 | knowledge | Gu full P unaware -> knows(true); partial E16-04 disclosure/credential | ? / R |
| H16 | temporal | Chen Maintenance Tunnel -> Old Pump House; D17-02 / E17-arrival | S / A |
| H17 | temporal | Same Chen mutation; N16-03 / E16-05 direction only | U / R |
| H18 | temporal | Keep Chen Hospital resolved; E14-01 departure, NO_CHANGE candidate | U / R |
| H19 | temporal | Chen Hospital -> unresolved, lastConfirmed Hospital; E14-01 ablation | ? / R |
| H20 | temporal | USB index_unlocked -> decrypted; E17-01 ablation | ? / R |

H09 exact evidence, shared with H08:

> 这一次我信你。先带我们离开这里，别替我决定下一步

H09 category is `explicit_operational`, predicate `cooperation`, value `active`, scope `general ongoing beyond current escape`. It does not use the deterministic-forbidden story-event psychological path. Gate: CONTRACT_VALID.

H17 exact evidence:

> 三个人沿着维护隧道向旧泵房方向撤离
>
> 顾言也没有转述刚才的对话

H16/H17 have identical target ID/type/path/before/after. H16's evidence is:

> 旧泵房的铁门还能从里面插上。顾言用工具柜顶住门，陈默关掉三个人的手机信号，林夏则把那台离线电脑放在生锈的控制台上

Both gates pass; only semantic support differs. H17 does not refer to father-at-C19 or convert Lin's false belief to historical truth.

## Ablation Evidence Audit

All IDs below exist in each case's full evidence fixture. Full/removed/remaining lists are stored with the fixture and tested. Remaining primary IDs equal the evaluated candidate's evidenceIds; retrieved evidence is empty in these ablation packets, so removed evidence cannot reappear via retrieval. Source revisions and their full text remain unchanged and are not sent as entire chapters. The gate is rerun on the ablated candidate, including its resolutionSupport IDs.

### H10: Missing Decisive Attribution

Full IDs = removed five + remaining one.

Removed decisive bundle:

```text
c181bd8e-83c9-49b4-8d98-1625918193c6  exclusive terminal / no remote login
60077f2e-cdfd-44dd-81aa-3ccc291282f3  live face + fingerprint
3f7c27b7-b886-4c09-8d43-2fcecd8730f2  no signing/key-export failures
ac016993-af5b-47b9-809b-8c0e165b35c4  camera shows Zhou himself
b4b74c00-49e4-415f-865a-1764c1b65186  unique authorization key
```

Remaining:

```text
5e9352d7-8d20-4cba-8d34-2bd78e7607d7
被篡改的记录把运往十九号冷库的设备改写成了不存在的货船
```

This establishes what was altered, neither who performed it nor that Zhou did not. The canonical thread is still progressing, with null resolution. No later Zhou-attribution knowledge is in the packet. UNCERTAIN, not UNSUPPORTED.

### H15: Partial Identity, Not Full P

Full IDs = `f47bf374-1d54-4559-864f-8f69106aa241`, `14685605-d469-40e6-8992-e7938e4a718e`, `fbfc59d6-280b-4fcf-8201-899aa2449fc4`.

Removed decisive: `14685605-d469-40e6-8992-e7938e4a718e`, the full disclosure including “我在港务安保里卧底”.

Remaining:

```text
f47bf374-1d54-4559-864f-8f69106aa241  顾言看见徽记随角度变色，也认出证件格式
fbfc59d6-280b-4fcf-8201-899aa2449fc4  市刑侦支队，陈默，警号 071306。
```

The second is a new exact subspan anchor in the unchanged source, not invented speech. Police identity/credential support only part of P; nothing supplied says Chen is not undercover. Canonical WorldTruth P=true does not establish Gu's access to full P; Gu remains unaware in pre-state. UNCERTAIN.

### H19: Departure Not Established

Full IDs = `2e7d6df9-4054-49d5-81a1-92a9195bf6de`, `a9ab3c37-2952-4e2f-8021-3c00f59c6ac0`, `8d508010-4ca1-4526-8cf9-69d07dee64b6`.

Removed decisive: `2e7d6df9-4054-49d5-81a1-92a9195bf6de`, “签字离院，没留下去向”. The empty-chair passage is not included either.

Remaining:

```text
a9ab3c37-2952-4e2f-8021-3c00f59c6ac0  林夏在处置室外等了十分钟。
8d508010-4ca1-4526-8cf9-69d07dee64b6  林夏始终把 USB 握在自己手里
```

These unchanged-source spans report Lin's waiting/activity, not Chen remaining at Hospital or leaving it. Pre-state Hospital is the baseline to update, not a fresh observation ruling out departure. UNCERTAIN.

### H20: Attempt Not Completion

Full IDs = `cc735b87-7897-4044-8ad8-829c4ecce544`, `b7aca6c6-eaee-4ac9-8dde-22711b93b9d0`.

Removed decisive: `cc735b87-7897-4044-8ad8-829c4ecce544`, “六份货单、三段录音和权限日志全部变为可读取状态”. Progress completion and subsequent reading are also absent from the model packet.

Remaining:

```text
b7aca6c6-eaee-4ac9-8dde-22711b93b9d0
她取出货单残页，将背面的三组字符输入 USB 的第二层密钥框。
```

This exact source span establishes key entry but no outcome. It says neither completed nor failed, so UNCERTAIN.

## Fair Execution and Generic Baseline

Generic receives one integrated semantic call using a neutral prompt: judge sufficient support, considering exact evidence, canonical state, character information access and time. It returns only generic agent label, verdict, concise reason and evidenceIds. No separate semantic subdimensions, risk, recommendation, confidence, tools, retries or reflection.

Specialists use production `routeAgents`, unchanged `specialistPrompts`, `parseSemanticOutput`, deterministicGate and aggregator. Evaluation-level case semantic verdict follows UNSUPPORTED > UNCERTAIN > SUPPORTED. Production aggregation is not changed. Generic routing uses the same gate, `impactPolicy`, context completeness and conservative semantic-to-review rule; it is not a production architecture replacement.

Both architectures receive byte-equivalent cloned ValidationPackets for a case. Same injected provider/model/version and decoding: temperature 0, 500 output tokens per call, one response, no retries/tools. Output verdict/reason/citation schema semantics are identical; only agent enum differs. Model/provider identity drift aborts rather than silently contaminating the comparison.

Case order is the fixed committed order for both sides, alternating which architecture runs first by case index and repetition. Specialist calls remain sequential, matching current production scheduling. This controls order without post-result randomization; it does not claim to remove all temporal provider variation.

No Gold/pairs/groups enter model payloads. Candidate claims remain proposals, not proof; both prompt paths declare narrative content untrusted DATA. No full hidden chain-of-thought is requested or persisted. Parsed reasons remain at most three sentences/600 characters.

## Metrics and Reporting

Anchor and Holdout are reported separately; architectureEvidence explicitly selects Holdout.

- Semantic accuracy: correct valid case-level verdict / eligible cases. Provider/parse failures become UNCERTAIN for safe routing but never receive accuracy credit merely because Gold is UNCERTAIN.
- False AUTO count: Gold routing is not AUTO, evaluated final routing is AUTO. Primary rate uses Gold non-AUTO cases as denominator; also report rate over all eligible cases.
- Safe AUTO coverage: correctly AUTO-routed Gold AUTO cases / all Gold AUTO cases.
- Review rate: NEEDS_REVIEW / eligible cases.
- Per-group semantic accuracy with explicit denominators; no absent group becomes 0% accuracy.
- Model calls per case, per-call and per-case latency, mean/median. p95 uses empirical nearest-rank only for at least 20 observations, with an explicit small-sample caveat.
- Usage and cost: only sum complete provider token metadata. Estimate cost only with explicit nonnegative pricing matching provider/model/version and currency; no hardcoded vendor prices. Missing usage/pricing means unavailable, never a fabricated zero.
- Structured report rejects duplicate, unknown or incomplete primary results, and labels invalid responses separately.

Stability IDs selected before live: **H04, H05, H07, H10, H11, H13, H15, H17, H19, H20**. Distribution: control 2, evidence 2, knowledge 3, temporal 3. Three additional runs for each selected case per architecture, separate from the primary run. Stable means 3 valid responses with exactly one verdict; incomplete sets are unavailable and three provider failures are not counted as stable semantic behavior.

Minimal pairs: H06/H07, H08/H09, H12/Ch15-B, H13/H14, H17/H16, H19/Ch14-A. Pair metadata is analysis-only.

Architecture policy remains PO-owned: retain specialists only when safety does not regress, interpretable Holdout boundary gains are meaningful, and extra calls/latency/cost are justified. Effective equivalence favors simpler Generic; Generic superiority also supports simplification. A one-case difference on N=20 is not automatically meaningful. No significance or automatic product mutation is manufactured.

The 20 Holdout cases are a preregistered internal StoryState challenge set derived from Ch13–17 and known semantic boundary classes. They support an architecture decision within the current StoryState domain. They do not establish universal superiority across all long-horizon AIGC domains.

## Deterministic Verification

Commands:

```sh
npm run test:eval
npm run eval:semantic:harness -- --stability
npm run eval:semantic:harness -- --report
```

The CLI only constructs a uniform-SUPPORTED mock and prints to stdout; it cannot run a live provider, load API keys or rewrite Gold. Mock reports say **HARNESS TEST ONLY**. Uniform mocks intentionally produce semantic 8/20 and false AUTO 6/15 in Holdout; these are metric plumbing checks, not real-model accuracy. The mock does not read Gold to choose verdicts.

Real provider calls made: **NO**. No live result files generated. Stage 2.2.1B network/provider adapter integration and real semantic evaluation require a separate design and explicit authorization. Existing Stage 2.2 production provider behavior and all three Frozen Docs remain unchanged.

Executed locally after implementation:

| Verification | Result |
| --- | --- |
| npm install | PASS; 0 reported vulnerabilities; existing esbuild/fsevents/unrs-resolver install-script approval warnings left unchanged |
| npm run build / npm run lint | PASS / PASS |
| npm test | 221/221 PASS |
| npm run test:backend | 62/62 PASS |
| npm run test:benchmark | 11/11 PASS |
| npm run test:validator | 72/72 PASS |
| npm run test:eval | 51/51 PASS |
| mock CLI stability + report | PASS, HARNESS TEST ONLY; 198 mock calls with stability, zero real calls |
| Stage 1.3 regression | Original 25/25 PASS |
| Stage 2.1/2.1.2/2.2 regression | Original backend, exact and validator suites unchanged and passing |
| Migration/persistence | Existing PGlite empty migration and validator JSONB round-trip actually executed |

Counts include Node parent tests/subtests. `npm run dev -- --port 3100` reported ready but did not remain listening; read-only browser smoke used the existing `http://127.0.0.1:3013` server. Library, Workspace, Review, State, History and Setup rendered; Review 7 details / 0 open. No decisions were made in the browser. Available viewport: 697x671; desktop-width visual verification not completed. Existing server was not changed or stopped.
