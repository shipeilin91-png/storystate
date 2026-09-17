# Interview Evidence

| Question | Evidence-backed answer | Source |
| --- | --- | --- |
| Why not ordinary RAG? | Existing product evidence validates governance and human routing; no RAG attribution experiment was executed. | STATE_SYNC_METRICS.json |
| How much did RAG add? | MISSING. A2 was frozen but not executed, and product RAG is not implemented. | RUN_CONFIG.json |
| How much did state governance add? | MISSING for real models. Deterministic replay must not substitute for A3. | STATE_SYNC_METRICS.json |
| Why incremental state? | It preserves a versioned current truth and gates field-level changes instead of regenerating the whole state; existing evidence applied 67/67 Gold transitions and blocked 46/46 invalid challenges. | ../RESUME_METRICS_AUDIT.md |
| Does performance decay with story length? | MISSING for models. The benchmark freezes revision-level curves, but no model run exists. | STATE_SYNC_RAW_RESULTS.jsonl |
| Which fields are hardest? | MISSING for the new benchmark. Existing Holdout had evidence/knowledge/temporal boundaries but is too small for a universal ranking. | ../stage-2.2.1b/metrics.json |
| How are errors stopped? | Deterministic compiler/gates, conservative validator routing, human Decision, and controlled commit; only committed state counts as an escape. | ../RESUME_METRICS_AUDIT.md |
| How incomplete are user outlines? | Frozen Holdout raw outlines cover 90/144 = 62.5% of Gold fields. Sparse/medium/detailed breakdown is in BLUEPRINT_METRICS.json. | BLUEPRINT_METRICS.json |
| What does AI add or over-add? | MISSING because B1 was not executed. | BLUEPRINT_RAW_RESULTS.jsonl |
| How much human editing remains? | Raw baseline needs 54 ADD operations; post-AI edits are MISSING. This is an edit-count proxy, not time saved. | BLUEPRINT_METRICS.json |
| What is cost and latency? | New benchmark: 0 calls and no model results. Planned bounded budget is 288 expected calls / 300 hard cap. Existing semantic experiment usage remains separate. | COST_LATENCY_METRICS.json |
| Why retain human review? | Existing live Holdout routed all 15 unsafe cases to humans while safely auto-handling 4 cases. | ../stage-2.2.1b/metrics.json |
| What should real users validate next? | Production prevalence, reviewer time, real-outline quality, and paired A1/A2/A3 performance. | BENCHMARK_DESIGN.md |
