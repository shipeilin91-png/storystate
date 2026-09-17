#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="feat/evidence-rag-v0-1"
BASE_SHA="0e0e3854cd37a0c012cdf2360a78dcc6b041cb45"
PROJECT="storystate"
PROJECT_REF="wgjlbkdtznnujjauhdox"
RESULT_DIR="$ROOT/docs/evaluation/rag-v0.1"
RESULT_FILE="$RESULT_DIR/live-results.json"
SUMMARY_FILE="$RESULT_DIR/live-summary.json"
MIGRATION="$ROOT/supabase/migrations/20260917000100_story_evidence_chunks.sql"

fail() { printf 'STORYSTATE_RAG_FINALIZE: BLOCKED\nreason: %s\n' "$*" >&2; exit 1; }
trap 'rm -f "$ROOT/.rag-apply-migration.mjs" /tmp/storystate-rag-production-deploy.log' EXIT

for bin in git jq python3 curl npx supabase; do command -v "$bin" >/dev/null || fail "$bin is required"; done
[ "$(git -C "$ROOT" branch --show-current)" = "$BRANCH" ] || fail "wrong branch"
[ -z "$(git -C "$ROOT" status --porcelain)" ] || fail "feature worktree is dirty"
[ "$(git -C "$ROOT" rev-parse origin/main)" = "afca043b64f0dabf1021147b35b7ae1f5b674aa1" ] || fail "unexpected main baseline"
git -C "$ROOT" fetch origin >/dev/null
git -C "$ROOT" merge-base --is-ancestor "$BASE_SHA" HEAD || fail "feature branch is not based on approved RAG implementation"

if ! supabase projects list >/dev/null 2>&1; then
  printf '请完成当前打开的 Supabase 官方登录。\n'
  supabase login
fi
if ! (cd "$ROOT" && VERCEL_TELEMETRY_DISABLED=1 npx --yes vercel@latest whoami >/dev/null 2>&1); then
  printf '请完成当前打开的 Vercel 官方登录。\n'
  (cd "$ROOT" && VERCEL_TELEMETRY_DISABLED=1 npx --yes vercel@latest login)
fi
(cd "$ROOT" && VERCEL_TELEMETRY_DISABLED=1 npx --yes vercel@latest whoami >/dev/null 2>&1) || fail "Vercel authentication unavailable"

mkdir -p "$ROOT/.vercel" "$RESULT_DIR"
[ -f "$ROOT/.vercel/project.json" ] || printf '%s\n' '{"projectId":"prj_piKoOPZdB6TWy1JyG4tZTDqu8naL","orgId":"team_kpLUVLWiflVLJnbTOsodZvdA","projectName":"storystate"}' > "$ROOT/.vercel/project.json"

DB_JS="$(cat <<'JS'
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
const raw = process.env.STORYSTATE_DATABASE_URL;
if (!raw || raw === "[SENSITIVE]") throw new Error("REMOTE_DATABASE_REQUIRED");
const host = new URL(raw).hostname.toLowerCase();
if (["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error("REMOTE_DATABASE_REQUIRED");
const pool = new Pool({connectionString: raw, max: 1});
try {
  await pool.query(await readFile(process.env.STORYSTATE_RAG_MIGRATION, "utf8"));
  const row = (await pool.query(`
    select to_regclass('public.story_evidence_chunks') is not null as table_exists,
      (select count(*)::int from stories) as stories,
      (select count(*)::int from source_revisions) as revisions,
      (select count(*)::int from story_evidence_chunks) as chunks
  `)).rows[0];
  console.log(JSON.stringify({DATABASE_TARGET:"REMOTE", ...row}));
} finally { await pool.end(); }
JS
)"

run_remote() {
  (cd "$ROOT" && env -u STORYSTATE_DATABASE_URL -u DATABASE_URL VERCEL_TELEMETRY_DISABLED=1 \
    npx --yes vercel@latest env run --project "$PROJECT" -e production -- "$@")
}

printf 'migration\n'
run_remote env STORYSTATE_RAG_MIGRATION="$MIGRATION" node --input-type=module -e "$DB_JS" | tail -1 | tee "$RESULT_DIR/migration.json"
jq -e '.table_exists == true and .DATABASE_TARGET == "REMOTE"' "$RESULT_DIR/migration.json" >/dev/null || fail "migration verification failed"

printf 'backfill\n'
run_remote npm run rag:backfill | tail -1 | tee "$RESULT_DIR/backfill-first.json"
run_remote npm run rag:backfill | tail -1 | tee "$RESULT_DIR/backfill-second.json"
jq -e '.backfill == "PASS"' "$RESULT_DIR/backfill-first.json" >/dev/null || fail "first backfill failed"
jq -e '.backfill == "PASS" and .chunksCreated == 0' "$RESULT_DIR/backfill-second.json" >/dev/null || fail "backfill is not idempotent"

printf 'retrieval smoke\n'
run_remote npm run rag:production-smoke | tail -1 | tee "$RESULT_DIR/retrieval-smoke.json"
jq -e '.crossStoryChunksInResult == 0 and .currentRevisionLeakage == 0 and .futureRevisionLeakage == 0 and .topKPass and .contextBudgetPass and .vectorRankingPass and .dedupePass' "$RESULT_DIR/retrieval-smoke.json" >/dev/null || fail "retrieval smoke failed"

printf 'real DeepSeek A/B\n'
(
  cd "$ROOT"
  RAG_LIVE_BENCHMARK=1 RAG_BENCHMARK_OUTPUT="$RESULT_FILE" \
    env -u STORYSTATE_DATABASE_URL -u DATABASE_URL VERCEL_TELEMETRY_DISABLED=1 \
    npx --yes vercel@latest env run --project "$PROJECT" -e production -- npm run benchmark:rag
)
jq -e '.status == "COMPLETED" and (.cases|length) == 12' "$RESULT_FILE" >/dev/null || fail "real 12-case A/B did not complete"

python3 - "$RESULT_FILE" "$SUMMARY_FILE" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
cases = data["cases"]
groups = {}
for item in cases:
    g = groups.setdefault(item["group"], {"total":0,"baselinePass":0,"ragPass":0,"improvements":0,"regressions":0})
    g["total"] += 1
    g["baselinePass"] += int(item["baseline"]["pass"])
    g["ragPass"] += int(item["rag"]["pass"])
    g["improvements"] += int(item["rag"]["pass"] and not item["baseline"]["pass"])
    g["regressions"] += int(item["baseline"]["pass"] and not item["rag"]["pass"])
n = len(cases)
b = sum(int(x["baseline"]["pass"]) for x in cases)
r = sum(int(x["rag"]["pass"]) for x in cases)
leak = sum(int(x["baseline"]["historicalLeakage"] or x["rag"]["historicalLeakage"]) for x in cases)
reg = sum(int(x["baseline"]["pass"] and not x["rag"]["pass"]) for x in cases)
imp = sum(int(x["rag"]["pass"] and not x["baseline"]["pass"]) for x in cases)
safe = leak == 0 and reg == 0 and imp > 0 and r >= b and all(x["baseline"]["evidenceValid"] and x["rag"]["evidenceValid"] for x in cases)
summary = {
  "cases": n, "groups": groups, "baselinePassCount": b, "baselinePassPercent": round(b*100/n,2),
  "ragPassCount": r, "ragPassPercent": round(r*100/n,2), "absoluteChangePp": round((r-b)*100/n,2),
  "relativeImprovementPercent": None if not b else round((r-b)*100/b,2),
  "historicalEvidenceLeakage": leak, "regressions": reg, "improvements": imp,
  "decision": "SAFE_TO_ENABLE" if safe else "IMPLEMENTED_BUT_DISABLED_AFTER_BENCHMARK"
}
json.dump(summary, open(sys.argv[2],"w"), ensure_ascii=False, indent=2)
PY

DECISION="$(jq -r '.decision' "$SUMMARY_FILE")"
printf 'final regression\n'
(cd "$ROOT" && npm run build >/dev/null && npm run lint >/dev/null && npm test >/dev/null)

if [ "$DECISION" = "SAFE_TO_ENABLE" ]; then
  (cd "$ROOT" && VERCEL_TELEMETRY_DISABLED=1 npx --yes vercel@latest env add STORYSTATE_RAG_ENABLED preview <<<"1" >/dev/null)
else
  PREVIEW_FLAG="$(cd "$ROOT" && VERCEL_TELEMETRY_DISABLED=1 npx --yes vercel@latest env ls preview 2>/dev/null | awk '$1 == "STORYSTATE_RAG_ENABLED" {print $1; exit}')"
  [ -z "$PREVIEW_FLAG" ] || fail "preview RAG flag exists while decision is disabled; remove it manually in Vercel"
fi
PREVIEW_URL="$(cd "$ROOT" && VERCEL_TELEMETRY_DISABLED=1 npx --yes vercel@latest deploy --yes | tail -1)"
for path in / /stories/fog-harbor/workspace /stories/fog-harbor/review /stories/fog-harbor/state /stories/fog-harbor/history; do
  [ "$(curl -sS -o /dev/null -w '%{http_code}' "$PREVIEW_URL$path")" = "200" ] || fail "preview failed: $path"
done

if [ "$DECISION" = "SAFE_TO_ENABLE" ]; then
  (cd "$ROOT" && VERCEL_TELEMETRY_DISABLED=1 npx --yes vercel@latest env add STORYSTATE_RAG_ENABLED production <<<"1" >/dev/null)
  (cd "$ROOT" && VERCEL_TELEMETRY_DISABLED=1 npx --yes vercel@latest --prod --yes >/tmp/storystate-rag-production-deploy.log)
  printf 'DEPLOYED_AND_ENABLED\n'
else
  printf 'IMPLEMENTED_BUT_DISABLED_AFTER_BENCHMARK\n'
fi

git -C "$ROOT" add "$RESULT_DIR" "$RESULT_DIR/../RAG_V0_1_BENCHMARK.md" 2>/dev/null || true
if ! git -C "$ROOT" diff --cached --quiet; then
  git -C "$ROOT" commit -m "feat: finalize StoryState evidence RAG v0.1"
fi
git -C "$ROOT" push origin "$BRANCH"
MAIN_WORKTREE="$(git -C "$ROOT" worktree list --porcelain | awk '
  /^worktree / { path=$2 }
  /^branch refs\/heads\/main$/ { print path; exit }
')"
[ -n "$MAIN_WORKTREE" ] || fail "main worktree not found"
[ -z "$(git -C "$MAIN_WORKTREE" status --porcelain)" ] || fail "main worktree is dirty"
git -C "$MAIN_WORKTREE" fetch origin >/dev/null
git -C "$MAIN_WORKTREE" merge --no-ff "$BRANCH" -m "merge: add StoryState Evidence RAG v0.1"
git -C "$MAIN_WORKTREE" push origin main
printf 'feature_sha=%s\n' "$(git -C "$ROOT" rev-parse HEAD)"
printf 'main_sha=%s\n' "$(git -C "$MAIN_WORKTREE" rev-parse HEAD)"
printf 'decision=%s\n' "$DECISION"
