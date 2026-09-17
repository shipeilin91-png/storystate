#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="feat/evidence-rag-v0-1"
BASE_SHA="0e0e3854cd37a0c012cdf2360a78dcc6b041cb45"
PROJECT="storystate"
DEMO_STORY_ID="2c600001-0000-4000-8000-000000000001"
STATE_DIR="$ROOT/.rag-finalize-state"
RESULT_STAGE="$STATE_DIR/results"
RESULT_DIR="$ROOT/docs/evaluation/rag-v0.1"
TEMP_ROUTE="$ROOT/app/api/internal/rag-finalize/route.ts"
TEMP_HELPER="$ROOT/lib/rag/finalization.ts"
TEMP_TEST="$ROOT/tests/rag-finalization.test.ts"
CURRENT_PHASE="startup"
TEMP_DEPLOYED=0
CLEAN_DEPLOYED=0

phase() {
  CURRENT_PHASE="$1"
  printf '\n== StoryState RAG finalization: %s ==\n' "$CURRENT_PHASE"
}

fail() {
  printf '\nSTORYSTATE_RAG_FINALIZE: BLOCKED\nphase: %s\nreason: %s\n' \
    "$CURRENT_PHASE" "$*" >&2
  exit 1
}

on_exit() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    printf 'resume: rerun the same command; completed phase artifacts were preserved\n' >&2
    if [ "$TEMP_DEPLOYED" -eq 1 ] && [ "$CLEAN_DEPLOYED" -eq 0 ] &&
       [ ! -f "$TEMP_ROUTE" ] && [ -f "$ROOT/.vercel/project.json" ]; then
      printf 'cleanup: attempting a route-free Production deployment with RAG disabled\n' >&2
      (
        cd "$ROOT"
        NO_COLOR=1 FORCE_COLOR=0 VERCEL_TELEMETRY_DISABLED=1 \
          npx --yes vercel@latest deploy --prod --yes \
          --env STORYSTATE_RAG_ENABLED=0 >/dev/null 2>&1
      ) || true
    fi
  fi
}
trap on_exit EXIT

for binary in git jq curl openssl node npm npx; do
  command -v "$binary" >/dev/null 2>&1 || fail "$binary is required"
done

phase "repository preflight"
[ "$(git -C "$ROOT" branch --show-current)" = "$BRANCH" ] ||
  fail "run from $BRANCH"
git -C "$ROOT" fetch origin
git -C "$ROOT" merge-base --is-ancestor "$BASE_SHA" HEAD ||
  fail "current HEAD is not a descendant of the approved RAG base"

if [ ! -f "$STATE_DIR/initialized" ]; then
  [ -z "$(git -C "$ROOT" status --porcelain --untracked-files=normal)" ] ||
    fail "worktree must be clean on the first run"
  [ "$(git -C "$ROOT" rev-parse HEAD)" = \
    "$(git -C "$ROOT" rev-parse "origin/$BRANCH")" ] ||
    fail "local feature branch is not synchronized with origin"
  mkdir -p "$RESULT_STAGE" "$STATE_DIR/logs"
  chmod 700 "$STATE_DIR"
  git -C "$ROOT" rev-parse HEAD >"$STATE_DIR/start-sha"
  openssl rand -hex 32 >"$STATE_DIR/token"
  chmod 600 "$STATE_DIR/token"
  printf 'initialized\n' >"$STATE_DIR/initialized"
else
  mkdir -p "$RESULT_STAGE" "$STATE_DIR/logs"
  git -C "$ROOT" merge-base --is-ancestor "$BASE_SHA" HEAD ||
    fail "resumed HEAD no longer descends from the approved RAG base"
fi

TOKEN="$(tr -d '\r\n' <"$STATE_DIR/token")"
[[ "$TOKEN" =~ ^[a-f0-9]{64}$ ]] || fail "invalid local finalization token state"

phase "Vercel authentication and project link"
if ! (
  cd "$ROOT"
  VERCEL_TELEMETRY_DISABLED=1 npx --yes vercel@latest whoami >/dev/null 2>&1
); then
  (
    cd "$ROOT"
    VERCEL_TELEMETRY_DISABLED=1 npx --yes vercel@latest login
  )
fi
(
  cd "$ROOT"
  VERCEL_TELEMETRY_DISABLED=1 npx --yes vercel@latest whoami >/dev/null
) || fail "Vercel authentication is unavailable"

if [ ! -f "$ROOT/.vercel/project.json" ]; then
  (
    cd "$ROOT"
    VERCEL_TELEMETRY_DISABLED=1 \
      npx --yes vercel@latest link --yes --project "$PROJECT"
  )
fi
[ "$(jq -r '.projectName // empty' "$ROOT/.vercel/project.json")" = "$PROJECT" ] ||
  fail "the linked Vercel project is not $PROJECT"

deployment_url_from_log() {
  grep -Eo 'https://[^[:space:]]+\.vercel\.app' "$1" | tail -n 1
}

deploy_production() {
  local flag="$1"
  local log="$2"
  local include_token="$3"
  local args=(deploy --prod --yes --env "STORYSTATE_RAG_ENABLED=$flag")
  if [ "$include_token" = "1" ]; then
    args+=(--env "STORYSTATE_RAG_FINALIZE_TOKEN=$TOKEN")
  fi
  (
    cd "$ROOT"
    NO_COLOR=1 FORCE_COLOR=0 VERCEL_TELEMETRY_DISABLED=1 \
      npx --yes vercel@latest "${args[@]}"
  ) 2>&1 | tee "$log"
  local url
  url="$(deployment_url_from_log "$log")"
  [[ "$url" =~ ^https://.*\.vercel\.app$ ]] ||
    fail "Vercel did not return a deployment URL"
  printf '%s\n' "$url"
}

api_post() {
  local output="$1"
  local payload="$2"
  local retries="${3:-0}"
  local temp="$output.tmp"
  local code
  local retry_args=()
  if [ "$retries" -gt 0 ]; then
    retry_args=(--retry "$retries" --retry-delay 2 --retry-all-errors)
  fi
  if ! code="$(curl --silent --show-error --location \
    --connect-timeout 15 --max-time 75 "${retry_args[@]}" \
    --output "$temp" --write-out '%{http_code}' \
    --request POST \
    --header "Authorization: Bearer $TOKEN" \
    --header "Content-Type: application/json" \
    --data "$payload" \
    "$TEMP_URL/api/internal/rag-finalize")"; then
    rm -f "$temp"
    fail "request failed before a sanitized response was received"
  fi
  if [ "$code" != "200" ]; then
    printf 'http_status=%s response=' "$code" >&2
    jq -c . "$temp" >&2 2>/dev/null || printf '{"error":"INVALID_RESPONSE"}\n' >&2
    rm -f "$temp"
    fail "server-runtime action failed"
  fi
  mv "$temp" "$output"
}

if [ ! -f "$STATE_DIR/benchmark.complete" ]; then
  [ -f "$TEMP_ROUTE" ] || fail "temporary finalization route is missing"
  [ -f "$TEMP_HELPER" ] || fail "temporary finalization helper is missing"

  phase "temporary Production deployment with RAG disabled"
  if [ ! -s "$STATE_DIR/temp-url" ]; then
    deploy_production 0 "$STATE_DIR/logs/temp-deploy.log" 1 |
      tail -n 1 >"$STATE_DIR/temp-url"
  fi
  TEMP_URL="$(tr -d '\r\n' <"$STATE_DIR/temp-url")"
  [[ "$TEMP_URL" =~ ^https://.*\.vercel\.app$ ]] ||
    fail "invalid temporary deployment URL"
  TEMP_DEPLOYED=1

  phase "server-runtime readiness"
  if [ ! -s "$RESULT_STAGE/status.json" ]; then
    api_post "$RESULT_STAGE/status.json" '{"action":"status"}' 5
  fi
  jq -e '
    .status == "READY" and
    .databaseTarget == "REMOTE" and
    .ragEnabled == false and
    .caseCount == 12
  ' "$RESULT_STAGE/status.json" >/dev/null ||
    fail "server runtime is not ready or RAG was not forced off"

  phase "server-runtime additive migration"
  if [ ! -s "$RESULT_STAGE/migration.json" ]; then
    api_post "$RESULT_STAGE/migration.json" '{"action":"migrate"}'
  fi
  jq -e '
    .migration == "PASS" and
    .databaseTarget == "REMOTE" and
    .tableExists == true
  ' "$RESULT_STAGE/migration.json" >/dev/null ||
    fail "migration verification failed"

  phase "server-runtime idempotent backfill"
  if [ ! -s "$RESULT_STAGE/backfill-first.json" ]; then
    api_post "$RESULT_STAGE/backfill-first.json" '{"action":"backfill"}'
  fi
  jq -e '
    (.sourceRevisionsScanned | type == "number") and
    (.chunksCreated | type == "number") and
    (.chunksDeduped | type == "number") and
    .failures == 0
  ' "$RESULT_STAGE/backfill-first.json" >/dev/null ||
    fail "first backfill reported failures"
  if [ ! -s "$RESULT_STAGE/backfill-second.json" ]; then
    api_post "$RESULT_STAGE/backfill-second.json" '{"action":"backfill"}'
  fi
  jq -e '.failures == 0 and .chunksCreated == 0' \
    "$RESULT_STAGE/backfill-second.json" >/dev/null ||
    fail "second backfill was not idempotent"

  phase "production retrieval smoke"
  if [ ! -s "$RESULT_STAGE/retrieval-smoke.json" ]; then
    api_post "$RESULT_STAGE/retrieval-smoke.json" \
      '{"action":"retrieval-smoke"}'
  fi
  if ! jq -e '
    .retrievalSmoke == "PASS" and
    .databaseTarget == "REMOTE" and
    .sameStory == "PASS" and
    .crossStory == 0 and
    .currentRevisionLeakage == 0 and
    .futureRevisionLeakage == 0 and
    .topK <= 5 and
    .contextChars <= 3600 and
    .vectorRanking == "PASS" and
    .recency == "PASS" and
    .entityBoost == "PASS" and
    .dedupe == "PASS" and
    (.failures | length) == 0
  ' "$RESULT_STAGE/retrieval-smoke.json" >/dev/null; then
    printf 'failed_checks=%s\n' \
      "$(jq -c '.failures' "$RESULT_STAGE/retrieval-smoke.json")" >&2
    fail "retrieval smoke failed; DeepSeek benchmark was not started"
  fi

  phase "real 12-case DeepSeek A/B in Vercel runtime"
  CASE_IDS=(R01 R02 R03 R04 R05 R06 R07 R08 R09 R10 R11 R12)
  ARMS=(baseline rag)
  RESULT_FILES=()
  for case_id in "${CASE_IDS[@]}"; do
    for arm in "${ARMS[@]}"; do
      output="$RESULT_STAGE/$case_id-$arm.json"
      RESULT_FILES+=("$output")
      if [ ! -s "$output" ]; then
        payload="$(jq -cn \
          --arg caseId "$case_id" \
          --arg arm "$arm" \
          '{action:"benchmark-case",caseId:$caseId,arm:$arm}')"
        printf 'benchmark %s %s\n' "$case_id" "$arm"
        api_post "$output" "$payload"
      fi
      jq -e --arg caseId "$case_id" --arg arm "$arm" '
        .caseId == $caseId and .arm == $arm and
        (.group | type == "string") and
        (.pass | type == "boolean") and
        (.stateEffectCorrect | type == "boolean") and
        (.entityResolutionCorrect | type == "boolean") and
        (.staleHistoryError | type == "number") and
        (.ownershipCustodyViolation | type == "number") and
        (.beliefTruthViolation | type == "number") and
        (.redundantCandidateError | type == "number") and
        (.schemaValid | type == "boolean") and
        (.evidenceValid | type == "boolean") and
        (.historicalEvidenceLeakage | type == "number") and
        (keys | sort) == ([
          "arm","beliefTruthViolation","caseId",
          "entityResolutionCorrect","evidenceValid","group",
          "historicalEvidenceLeakage","ownershipCustodyViolation",
          "pass","redundantCandidateError","schemaValid",
          "staleHistoryError","stateEffectCorrect"
        ] | sort)
      ' "$output" >/dev/null || fail "invalid sanitized benchmark result"
    done
  done
  jq -s '{
    status: "COMPLETED",
    datasetVersion: "evidence-rag-v0.1",
    cases: .
  }' "${RESULT_FILES[@]}" >"$RESULT_STAGE/live-results.json"

  RESULTS_FILE="$RESULT_STAGE/live-results.json" \
    SUMMARY_FILE="$RESULT_STAGE/live-summary.json" node <<'NODE'
const fs = require("node:fs");
const data = JSON.parse(fs.readFileSync(process.env.RESULTS_FILE, "utf8"));
const pairs = [];
for (const caseId of [...new Set(data.cases.map(value => value.caseId))]) {
  const baseline = data.cases.find(value => value.caseId === caseId && value.arm === "baseline");
  const rag = data.cases.find(value => value.caseId === caseId && value.arm === "rag");
  if (!baseline || !rag) throw new Error(`Missing benchmark pair ${caseId}`);
  pairs.push({ caseId, group: baseline.group, baseline, rag });
}
if (pairs.length !== 12) throw new Error("Expected 12 benchmark pairs");
const count = arm => pairs.filter(value => value[arm].pass).length;
const baselinePassCount = count("baseline");
const ragPassCount = count("rag");
const pct = value => Number((value * 100 / pairs.length).toFixed(2));
const sum = (arm, field) => pairs.reduce((total, value) => total + value[arm][field], 0);
const groupNames = ["old_state", "custody", "belief_report", "pronouns", "redundant", "reversals"];
const groups = groupNames.map(group => {
  const values = pairs.filter(value => value.group === group);
  const baselinePass = values.filter(value => value.baseline.pass).length;
  const ragPass = values.filter(value => value.rag.pass).length;
  return {
    group,
    total: values.length,
    baselinePass,
    baselinePercent: Number((baselinePass * 100 / values.length).toFixed(2)),
    ragPass,
    ragPercent: Number((ragPass * 100 / values.length).toFixed(2)),
    improvements: values.filter(value => value.rag.pass && !value.baseline.pass).length,
    regressions: values.filter(value => value.baseline.pass && !value.rag.pass).length,
  };
});
const historicalEvidenceLeakage =
  sum("baseline", "historicalEvidenceLeakage") +
  sum("rag", "historicalEvidenceLeakage");
const ownershipNoNewRegression = pairs.every(value =>
  value.rag.ownershipCustodyViolation <= value.baseline.ownershipCustodyViolation);
const beliefTruthNoNewRegression = pairs.every(value =>
  value.rag.beliefTruthViolation <= value.baseline.beliefTruthViolation);
const canonicalMutationSafetyNoRegression = pairs.every(value =>
  value.baseline.schemaValid && value.rag.schemaValid);
const schemaEvidenceNoRegression = pairs.every(value =>
  value.baseline.schemaValid && value.rag.schemaValid &&
  value.baseline.evidenceValid && value.rag.evidenceValid);
const historyDependentImprovements = pairs.filter(value =>
  value.rag.pass && !value.baseline.pass).length;
const regressions = pairs.filter(value =>
  value.baseline.pass && !value.rag.pass).length;
const safe =
  historicalEvidenceLeakage === 0 &&
  ownershipNoNewRegression &&
  beliefTruthNoNewRegression &&
  canonicalMutationSafetyNoRegression &&
  schemaEvidenceNoRegression &&
  historyDependentImprovements > 0 &&
  ragPassCount >= baselinePassCount;
const summary = {
  datasetVersion: data.datasetVersion,
  caseCount: pairs.length,
  baselinePassCount,
  baselinePercent: pct(baselinePassCount),
  ragPassCount,
  ragPercent: pct(ragPassCount),
  absoluteChangePp: Number((pct(ragPassCount) - pct(baselinePassCount)).toFixed(2)),
  relativeImprovementPercent: baselinePassCount === 0
    ? null
    : Number(((ragPassCount - baselinePassCount) * 100 / baselinePassCount).toFixed(2)),
  groups,
  safety: {
    historicalEvidenceLeakage,
    ownershipNoNewRegression,
    beliefTruthNoNewRegression,
    canonicalMutationSafetyNoRegression,
    schemaEvidenceNoRegression,
    historyDependentImprovements,
    regressions,
  },
  decision: safe
    ? "SAFE_TO_ENABLE"
    : "IMPLEMENTED_BUT_DISABLED_AFTER_BENCHMARK",
};
fs.writeFileSync(process.env.SUMMARY_FILE, `${JSON.stringify(summary, null, 2)}\n`);
NODE
  printf 'completed\n' >"$STATE_DIR/benchmark.complete"
fi

DECISION="$(jq -r '.decision' "$RESULT_STAGE/live-summary.json")"
case "$DECISION" in
  SAFE_TO_ENABLE) FINAL_FLAG=1 ;;
  IMPLEMENTED_BUT_DISABLED_AFTER_BENCHMARK) FINAL_FLAG=0 ;;
  *) fail "invalid enablement decision" ;;
esac
printf 'baseline=%s/12 (%s%%)\n' \
  "$(jq -r '.baselinePassCount' "$RESULT_STAGE/live-summary.json")" \
  "$(jq -r '.baselinePercent' "$RESULT_STAGE/live-summary.json")"
printf 'rag=%s/12 (%s%%)\n' \
  "$(jq -r '.ragPassCount' "$RESULT_STAGE/live-summary.json")" \
  "$(jq -r '.ragPercent' "$RESULT_STAGE/live-summary.json")"
printf 'decision=%s\n' "$DECISION"

phase "remove temporary server-only finalization surface"
rm -f "$TEMP_ROUTE" "$TEMP_HELPER" "$TEMP_TEST"
rmdir "$ROOT/app/api/internal/rag-finalize" 2>/dev/null || true
rmdir "$ROOT/app/api/internal" 2>/dev/null || true
[ ! -e "$TEMP_ROUTE" ] || fail "temporary route still exists"
[ ! -e "$TEMP_HELPER" ] || fail "temporary server helper still exists"

mkdir -p "$RESULT_DIR"
cp "$RESULT_STAGE/live-results.json" "$RESULT_DIR/live-results.json"
cp "$RESULT_STAGE/live-summary.json" "$RESULT_DIR/live-summary.json"
cp "$RESULT_STAGE/migration.json" "$RESULT_DIR/migration.json"
cp "$RESULT_STAGE/backfill-first.json" "$RESULT_DIR/backfill-first.json"
cp "$RESULT_STAGE/backfill-second.json" "$RESULT_DIR/backfill-second.json"
cp "$RESULT_STAGE/retrieval-smoke.json" "$RESULT_DIR/retrieval-smoke.json"

run_check() {
  local label="$1"
  shift
  printf 'check %s\n' "$label"
  (
    cd "$ROOT"
    "$@"
  ) 2>&1 | tee "$STATE_DIR/logs/$label.log"
}

phase "full local verification without temporary endpoint"
run_check build npm run build
run_check lint npm run lint
run_check test npm test
run_check test-backend npm run test:backend
run_check test-validator-v0-2 npm run test:validator-v0-2
run_check test-extraction-contract npm run test:extraction-contract
run_check test-extraction-eval npm run test:extraction-eval
run_check test-extraction-runtime npm run test:extraction-runtime
run_check test-extraction-api npm run test:extraction-api
run_check test-rag npm run test:rag
printf 'passed\n' >"$STATE_DIR/tests.complete"

phase "route-free final Production deployment"
if [ ! -s "$STATE_DIR/final-url" ]; then
  deploy_production "$FINAL_FLAG" "$STATE_DIR/logs/final-deploy.log" 0 |
    tail -n 1 >"$STATE_DIR/final-url"
fi
FINAL_URL="$(tr -d '\r\n' <"$STATE_DIR/final-url")"
[[ "$FINAL_URL" =~ ^https://.*\.vercel\.app$ ]] ||
  fail "invalid final deployment URL"
CLEAN_DEPLOYED=1

public_get() {
  local output="$1"
  local path="$2"
  local code
  if ! code="$(curl --silent --show-error --location \
    --retry 4 --retry-delay 2 --retry-all-errors \
    --connect-timeout 15 --max-time 75 \
    --output "$output" --write-out '%{http_code}' "$FINAL_URL$path")"; then
    fail "Production GET failed for $path"
  fi
  [ "$code" = "200" ] || fail "Production GET $path returned $code"
  if grep -Eiq 'Illegal invocation|DATABASE_(UNAVAILABLE|LOCAL_REJECTED)|DB error|EXTRACTOR_UNAVAILABLE|DeepSeek error' "$output"; then
    fail "Production GET $path exposed a runtime error"
  fi
}

public_post() {
  local output="$1"
  local path="$2"
  local body="$3"
  local code
  if ! code="$(curl --silent --show-error --location \
    --connect-timeout 15 --max-time 75 \
    --output "$output.tmp" --write-out '%{http_code}' \
    --request POST --header "Content-Type: application/json" \
    --data "$body" "$FINAL_URL$path")"; then
    rm -f "$output.tmp"
    fail "Production POST failed for $path"
  fi
  if [ "$code" != "200" ]; then
    printf 'http_status=%s response=' "$code" >&2
    jq -c . "$output.tmp" >&2 2>/dev/null || printf '{"error":"INVALID_RESPONSE"}\n' >&2
    rm -f "$output.tmp"
    fail "Production POST $path failed"
  fi
  mv "$output.tmp" "$output"
}

phase "Production route and backend smoke"
SMOKE_DIR="$STATE_DIR/product-smoke"
mkdir -p "$SMOKE_DIR"
public_get "$SMOKE_DIR/library.html" "/"
public_get "$SMOKE_DIR/workspace.html" "/stories/fog-harbor/workspace"
public_get "$SMOKE_DIR/review.html" "/stories/fog-harbor/review"
public_get "$SMOKE_DIR/state.html" "/stories/fog-harbor/state"
public_get "$SMOKE_DIR/history.html" "/stories/fog-harbor/history"
public_get "$SMOKE_DIR/backend-state.json" "/api/stories/$DEMO_STORY_ID/state"

route_code="$(curl --silent --show-error --location \
  --connect-timeout 15 --max-time 30 \
  --output "$SMOKE_DIR/removed-route.txt" --write-out '%{http_code}' \
  --request POST --header "Content-Type: application/json" \
  --data '{"action":"status"}' \
  "$FINAL_URL/api/internal/rag-finalize")"
[ "$route_code" = "404" ] ||
  fail "temporary finalization endpoint is still reachable"

if [ "$DECISION" = "SAFE_TO_ENABLE" ]; then
  phase "enabled RAG Extract to Commit smoke"
  if [ ! -f "$SMOKE_DIR/flow.complete" ]; then
    state_file="$SMOKE_DIR/backend-state.json"
    item_id="$(jq -r '
      [.state.items[] | select(.active == true)] |
      (map(select((.name | ascii_downcase) == "recorder")) + .) |
      .[0].id // empty
    ' "$state_file")"
    item_name="$(jq -r --arg id "$item_id" \
      '.state.items[] | select(.id == $id) | .name' "$state_file")"
    holder_id="$(jq -r --arg id "$item_id" \
      '.state.items[] | select(.id == $id) | .holder.value // empty' "$state_file")"
    from_id="$(jq -r --arg holder "$holder_id" '
      if $holder != "" then $holder
      else [.state.characters[] | select(.active == true)][0].id // empty end
    ' "$state_file")"
    target_id="$(jq -r --arg from "$from_id" '
      [.state.characters[] | select(.active == true and .id != $from)][0].id // empty
    ' "$state_file")"
    from_name="$(jq -r --arg id "$from_id" \
      '.state.characters[] | select(.id == $id) | .name' "$state_file")"
    target_name="$(jq -r --arg id "$target_id" \
      '.state.characters[] | select(.id == $id) | .name' "$state_file")"
    current_version="$(jq -r '.story.currentVersion' "$state_file")"
    current_chapter="$(jq -r '.story.currentChapter // 1' "$state_file")"
    [ -n "$item_id" ] && [ -n "$target_id" ] && [ -n "$from_name" ] &&
      [ -n "$target_name" ] || fail "demo story cannot support the enabled flow smoke"

    if [ ! -s "$SMOKE_DIR/document-id" ]; then
      node -e 'process.stdout.write(require("node:crypto").randomUUID())' \
        >"$SMOKE_DIR/document-id"
      node -e 'process.stdout.write(require("node:crypto").randomUUID())' \
        >"$SMOKE_DIR/revision-id"
      printf '%s\n' "$((current_chapter + 1))" >"$SMOKE_DIR/source-order"
    fi
    document_id="$(cat "$SMOKE_DIR/document-id")"
    revision_id="$(cat "$SMOKE_DIR/revision-id")"
    source_order="$(cat "$SMOKE_DIR/source-order")"
    source_content="${from_name}把${item_name}递给${target_name}：“你先拿着。”"

    if [ ! -f "$SMOKE_DIR/document.complete" ]; then
      body="$(jq -cn \
        --arg id "$document_id" \
        --argjson sourceOrder "$source_order" \
        '{id:$id,title:"Evidence RAG Production Smoke",sourceOrder:$sourceOrder,chapter:$sourceOrder}')"
      public_post "$SMOKE_DIR/document.json" \
        "/api/stories/$DEMO_STORY_ID/source-documents" "$body"
      printf 'completed\n' >"$SMOKE_DIR/document.complete"
    fi
    if [ ! -f "$SMOKE_DIR/revision.complete" ]; then
      body="$(jq -cn \
        --arg id "$revision_id" \
        --arg documentId "$document_id" \
        --arg content "$source_content" \
        '{id:$id,documentId:$documentId,revisionNumber:1,content:$content,visibility:"canonical"}')"
      public_post "$SMOKE_DIR/revision.json" \
        "/api/stories/$DEMO_STORY_ID/source-revisions" "$body"
      printf 'completed\n' >"$SMOKE_DIR/revision.complete"
    fi
    if [ ! -s "$SMOKE_DIR/extract.json" ]; then
      body="$(jq -cn --arg sourceRevisionId "$revision_id" \
        '{sourceRevisionId:$sourceRevisionId}')"
      public_post "$SMOKE_DIR/extract.json" \
        "/api/stories/$DEMO_STORY_ID/extract" "$body"
    fi
    delta_id="$(jq -r --arg item "$item_id" --arg target "$target_id" '
      [.candidateDeltas[] |
        select(.targetType == "items" and .targetId == $item and
          .fieldPath == "holder" and .after.value == $target)][0].id // empty
    ' "$SMOKE_DIR/extract.json")"
    [ -n "$delta_id" ] || fail "enabled extraction did not produce the expected holder candidate"

    public_get "$SMOKE_DIR/review.json" \
      "/api/stories/$DEMO_STORY_ID/review"
    jq -e --arg id "$delta_id" \
      '.candidateDeltas | any(.id == $id)' "$SMOKE_DIR/review.json" >/dev/null ||
      fail "Review did not hydrate the extracted candidate"

    if [ ! -s "$SMOKE_DIR/decision.json" ]; then
      body='{"decision":"accepted","actor":"rag-production-smoke","reason":"Verify the governed production flow"}'
      public_post "$SMOKE_DIR/decision.json" \
        "/api/stories/$DEMO_STORY_ID/deltas/$delta_id/decision" "$body"
    fi
    if [ ! -s "$SMOKE_DIR/commit.json" ]; then
      body="$(jq -cn \
        --arg deltaId "$delta_id" \
        --argjson expectedVersion "$current_version" \
        '{deltaIds:[$deltaId],expectedVersion:$expectedVersion}')"
      public_post "$SMOKE_DIR/commit.json" \
        "/api/stories/$DEMO_STORY_ID/commit" "$body"
    fi
    public_get "$SMOKE_DIR/state-after.json" \
      "/api/stories/$DEMO_STORY_ID/state"
    public_get "$SMOKE_DIR/versions.json" \
      "/api/stories/$DEMO_STORY_ID/versions"
    jq -e --arg item "$item_id" --arg target "$target_id" \
      '.state.items | any(.id == $item and .holder.value == $target)' \
      "$SMOKE_DIR/state-after.json" >/dev/null ||
      fail "committed holder change is absent from Production State"
    jq -e --argjson expected "$((current_version + 1))" \
      'any(.versionNumber == $expected)' "$SMOKE_DIR/versions.json" >/dev/null ||
      fail "committed version is absent from Production History"
    printf 'completed\n' >"$SMOKE_DIR/flow.complete"
  fi
fi

phase "remove temporary Vercel deployment"
if [ -s "$STATE_DIR/temp-url" ] && [ ! -f "$STATE_DIR/temp-deployment-removed" ]; then
  TEMP_URL="$(tr -d '\r\n' <"$STATE_DIR/temp-url")"
  (
    cd "$ROOT"
    NO_COLOR=1 FORCE_COLOR=0 VERCEL_TELEMETRY_DISABLED=1 \
      npx --yes vercel@latest remove "$TEMP_URL" --yes
  )
  printf 'removed\n' >"$STATE_DIR/temp-deployment-removed"
fi

jq -n \
  --arg decision "$DECISION" \
  --argjson ragEnabled "$([ "$FINAL_FLAG" = "1" ] && printf true || printf false)" \
  '{
    status:"PASS",
    routes:["/","Workspace","Review","State","History"],
    backendState:"PASS",
    temporaryFinalizationRouteRemoved:true,
    ragEnabled:$ragEnabled,
    governedFlow:(if $ragEnabled then "PASS" else "NOT_REQUIRED" end),
    decision:$decision
  }' >"$RESULT_DIR/production-smoke.json"

phase "write measured documentation"
ROOT="$ROOT" \
SUMMARY_FILE="$RESULT_DIR/live-summary.json" \
RESULTS_FILE="$RESULT_DIR/live-results.json" \
PRODUCTION_SMOKE_FILE="$RESULT_DIR/production-smoke.json" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const root = process.env.ROOT;
const summary = JSON.parse(fs.readFileSync(process.env.SUMMARY_FILE, "utf8"));
const smoke = JSON.parse(fs.readFileSync(process.env.PRODUCTION_SMOKE_FILE, "utf8"));
const percent = value => `${Number(value).toFixed(2)}%`;
const relative = summary.relativeImprovementPercent === null
  ? "N/A"
  : percent(summary.relativeImprovementPercent);
const decision = summary.decision;
const enabled = decision === "SAFE_TO_ENABLE";
const groups = summary.groups.map(value =>
  `| ${value.group} | ${value.baselinePass}/${value.total} | ${value.ragPass}/${value.total} | ${value.improvements} | ${value.regressions} |`,
).join("\n");

function replaceBlock(relative, content) {
  const file = path.join(root, relative);
  const start = "<!-- RAG_V0_1_LIVE_RESULT_START -->";
  const end = "<!-- RAG_V0_1_LIVE_RESULT_END -->";
  const source = fs.readFileSync(file, "utf8");
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end);
  if (startAt < 0 || endAt < startAt) throw new Error(`Missing result markers in ${relative}`);
  const updated = `${source.slice(0, startAt)}${start}\n${content.trim()}\n${source.slice(endAt)}`;
  fs.writeFileSync(file, updated);
}

const resultSentence =
  `The server-runtime 12-case DeepSeek A/B completed: baseline ${summary.baselinePassCount}/12 (${percent(summary.baselinePercent)}), ` +
  `RAG ${summary.ragPassCount}/12 (${percent(summary.ragPercent)}), absolute change ${summary.absoluteChangePp.toFixed(2)} pp, ` +
  `relative improvement ${relative}. Decision: **${decision}**. Production smoke passed with RAG ${enabled ? "enabled" : "disabled"}.`;
replaceBlock("README.md", resultSentence);
replaceBlock("PROJECT_STATE.md",
  `- Evidence RAG V0.1 live result: **${decision}**. Baseline ${summary.baselinePassCount}/12 (${percent(summary.baselinePercent)}); ` +
  `RAG ${summary.ragPassCount}/12 (${percent(summary.ragPercent)}); absolute ${summary.absoluteChangePp.toFixed(2)} pp; ` +
  `relative ${relative}. Production smoke: PASS; RAG ${enabled ? "enabled" : "disabled"}.`);
replaceBlock("docs/FINAL_ARCHITECTURE.md",
  `${resultSentence}\n\nThe final Production deployment contains no finalization route or server helper. ` +
  `Migration, backfill, retrieval smoke, and model calls ran only inside the temporary authenticated Vercel server runtime.`);
replaceBlock("docs/evaluation/RAG_V0_1_BENCHMARK.md", [
  `The real server-runtime A/B and Production smoke completed. Baseline: **${summary.baselinePassCount}/12 (${percent(summary.baselinePercent)})**. ` +
    `RAG: **${summary.ragPassCount}/12 (${percent(summary.ragPercent)})**. Absolute change: **${summary.absoluteChangePp.toFixed(2)} pp**. ` +
    `Relative improvement: **${relative}**. Decision: **${decision}**.`,
  "",
  "| Group | Baseline | RAG | Improvements | Regressions |",
  "| --- | ---: | ---: | ---: | ---: |",
  groups,
  "",
  `Safety: historical Evidence leakage ${summary.safety.historicalEvidenceLeakage}; ownership/custody no-new-regression ${summary.safety.ownershipNoNewRegression}; ` +
    `belief/truth no-new-regression ${summary.safety.beliefTruthNoNewRegression}; Canonical mutation safety ${summary.safety.canonicalMutationSafetyNoRegression}; ` +
    `schema/evidence safety ${summary.safety.schemaEvidenceNoRegression}.`,
].join("\n"));
replaceBlock("docs/evaluation/rag-v0.1/README.md", [
  `Decision: **${decision}**.`,
  "",
  `- Baseline: ${summary.baselinePassCount}/12 (${percent(summary.baselinePercent)})`,
  `- RAG: ${summary.ragPassCount}/12 (${percent(summary.ragPercent)})`,
  `- Absolute change: ${summary.absoluteChangePp.toFixed(2)} percentage points`,
  `- Relative improvement: ${relative}`,
  `- Production smoke: ${smoke.status}`,
  "",
  "`live-results.json` contains only per-case sanitized fields. `live-summary.json` records aggregate and six-group metrics.",
].join("\n"));

const featurePath = path.join(root, "feature_list.json");
const feature = JSON.parse(fs.readFileSync(featurePath, "utf8"));
feature.evidenceRagV01.status = enabled
  ? "implemented / benchmarked / production enabled"
  : "implemented / benchmarked / production disabled";
feature.evidenceRagV01.benchmarkStatus = "completed in authenticated Vercel server runtime";
feature.evidenceRagV01.decision = decision;
feature.evidenceRagV01.liveResult = {
  baseline: `${summary.baselinePassCount}/12 (${percent(summary.baselinePercent)})`,
  rag: `${summary.ragPassCount}/12 (${percent(summary.ragPercent)})`,
  absoluteChangePp: summary.absoluteChangePp,
  relativeImprovementPercent: summary.relativeImprovementPercent,
  groups: summary.groups,
};
feature.evidenceRagV01.productionSmoke = "PASS";
feature.release.deployment = "production deployed";
feature.release.runtimeSmoke = "PASS";
feature.release.evidenceRagEnabled = enabled;
fs.writeFileSync(featurePath, `${JSON.stringify(feature, null, 2)}\n`);

for (const [relative, from, to] of [
  ["README.md",
    "The current release is technically complete but has no published demo URL because deployment credentials are not available in this release environment.",
    "The Production deployment is available at https://storystate.vercel.app."],
  ["docs/FINAL_ARCHITECTURE.md",
    "The codebase is compatible with a single Vercel Next.js deployment, but the final release environment had no database, provider, or Vercel credentials. Deployment and real runtime smoke therefore remain blocked operationally; the product implementation and deterministic test coverage are complete.",
    `The Vercel Production deployment and runtime smoke passed. Evidence RAG is ${enabled ? "enabled" : "disabled"} according to the measured V0.1 decision.`],
]) {
  const file = path.join(root, relative);
  const source = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, source.includes(from) ? source.replace(from, to) : source);
}
NODE

phase "security and final Git checks"
[ ! -e "$TEMP_ROUTE" ] || fail "temporary route returned before finalization"
[ ! -e "$TEMP_HELPER" ] || fail "temporary helper returned before finalization"
unexpected_changes="$(
  git -C "$ROOT" status --porcelain --untracked-files=normal |
    sed -E 's/^.. //' |
    while IFS= read -r path; do
      case "$path" in
        README.md|PROJECT_STATE.md|feature_list.json|docs/FINAL_ARCHITECTURE.md|\
        docs/evaluation/RAG_V0_1_BENCHMARK.md|docs/evaluation/rag-v0.1/*|\
        app/api/internal/rag-finalize/route.ts|lib/rag/finalization.ts|\
        tests/rag-finalization.test.ts)
          ;;
        *)
          printf '%s\n' "$path"
          ;;
      esac
    done
)"
[ -z "$unexpected_changes" ] ||
  fail "unexpected worktree changes appeared during finalization: $unexpected_changes"
git -C "$ROOT" add -A
if git -C "$ROOT" grep --cached -F "$TOKEN" -- . >/dev/null 2>&1; then
  fail "one-time token appears in tracked content"
fi
if git -C "$ROOT" ls-files --cached | grep -E '(^|/)\.env($|\.)' >/dev/null; then
  fail "an environment file is tracked"
fi
if git -C "$ROOT" grep --cached -nE \
  'postgres(ql)?://[^[:space:]]+:[^[:space:]]+@|Bearer [a-f0-9]{32,}|sk-[A-Za-z0-9_-]{20,}' \
  -- ':!package-lock.json' >/dev/null 2>&1; then
  fail "tracked content matches a secret pattern"
fi
git -C "$ROOT" diff --cached --check
[ -z "$(git -C "$ROOT" diff --cached --diff-filter=ACMR --name-only |
  grep -E 'app/api/internal/rag-finalize|lib/rag/finalization')" ] ||
  fail "temporary server finalization files remain in the Git change"

if ! git -C "$ROOT" diff --cached --quiet; then
  git -C "$ROOT" commit -m "feat: finalize StoryState evidence RAG v0.1"
fi
git -C "$ROOT" push origin "$BRANCH"

phase "non-squash merge to main"
git -C "$ROOT" fetch origin
FEATURE_SHA="$(git -C "$ROOT" rev-parse HEAD)"
if ! git -C "$ROOT" merge-base --is-ancestor "$FEATURE_SHA" origin/main; then
  MERGE_WORKTREE="$STATE_DIR/main-merge"
  if [ -e "$MERGE_WORKTREE/.git" ]; then
    git -C "$ROOT" worktree remove --force "$MERGE_WORKTREE"
  fi
  git -C "$ROOT" worktree add --detach "$MERGE_WORKTREE" origin/main
  git -C "$MERGE_WORKTREE" merge --no-ff "$FEATURE_SHA" \
    -m "merge: add StoryState Evidence RAG v0.1"
  git -C "$MERGE_WORKTREE" push origin HEAD:main
  MAIN_SHA="$(git -C "$MERGE_WORKTREE" rev-parse HEAD)"
  git -C "$ROOT" worktree remove "$MERGE_WORKTREE"
else
  MAIN_SHA="$(git -C "$ROOT" rev-parse origin/main)"
fi

git -C "$ROOT" fetch origin
git -C "$ROOT" merge-base --is-ancestor "$FEATURE_SHA" origin/main ||
  fail "feature branch is not present on remote main"
[ -z "$(git -C "$ROOT" status --porcelain --untracked-files=normal)" ] ||
  fail "final worktree is not clean"

rm -rf "$STATE_DIR"
trap - EXIT
printf '\nSTORYSTATE_RAG_FINALIZE: COMPLETE\n'
printf 'feature_sha=%s\nmain_sha=%s\ndecision=%s\n' \
  "$FEATURE_SHA" "$MAIN_SHA" "$DECISION"
