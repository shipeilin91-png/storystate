# EvalPilot frontend reuse audit

Source: https://github.com/shipeilin91-png/evalpilot/tree/2191650de6896295f12bacf4dc3226ea0eaf56a5
Read-only audit of the user-pinned reference; no source repository modification or whole-repository copy.

## REUSE

- `components/product-ui.tsx`: lightly adapt generic Icon, StatusPill and PageIntro. Retain component pattern and generic SVG paths, expand task icons. No domain dependencies.
- `components/workspace-shell.tsx`: reuse header/sidebar composition and active-link accessibility; rename and replace routes, identity and story controls.
- `app/globals.css`: selected semantic color tokens, button, status, table, split layout ideas. Write a compact StoryState stylesheet without domain selectors.

## ADAPT

- `components/run-history-screen.tsx`: borrow chronological list, detail, empty state patterns; implement StoryVersion snapshots and explicit simulated rollback from scratch. No run store or tracking.
- `app/layout.tsx`: retain App Router metadata/zh-CN layout approach; new product identity and local system font stack (build does not fetch Google fonts).
- Routes inspected: `/`, `/connect`, `/history`, `/saved`, `/runs/[runId]`, `/api/existing-agent`, `/demo-agent-a/run`, `/demo-agent-b/execute`. Create independent story-scoped routes; none are copied.

## DROP

- Existing agent connection and multi-agent MVP logic; evaluation/benchmark data, analytics, run history persistence and agent APIs.
- All existing API/demo routes, TWS data, operational scripts, vinext, Cloudflare and Wrangler configuration.

UI uses a shared StoryState fixture and client-side state only. Attribution here documents the small user-authorized reuse, not a claim of code ownership or a license grant.
