#!/usr/bin/env bash
set -euo pipefail

# Nightly Template Regression v1
#
# Runs the full generation pipeline + quality gates + baseline comparison
# for all GREEN templates, then prints a consolidated regression report.
#
# Prerequisites: dev server running, Supabase, jq, curl
#
# Usage:
#   bash scripts/run-nightly-regression.sh
#   BASE_URL=https://staging.example.com bash scripts/run-nightly-regression.sh

BASE_URL="${BASE_URL:-http://localhost:3000}"
POLL_INTERVAL="${POLL_INTERVAL:-10}"
MAX_POLLS="${MAX_POLLS:-60}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/../regression-results"
NIGHTLY_ID="nightly-$(date +%Y%m%d-%H%M%S)"
NIGHTLY_STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)

mkdir -p "$RESULTS_DIR"

echo "=== NIGHTLY TEMPLATE REGRESSION ==="
echo "Run ID:   $NIGHTLY_ID"
echo "Base URL: $BASE_URL"
echo "Started:  $NIGHTLY_STARTED"
echo ""

# GREEN templates: fixture → templateKey → shortName
# Discovered from baseline files (template-agnostic approach)
declare -a TEMPLATES=()
declare -A FIXTURE_MAP=()
declare -A SHORT_MAP=()
declare -A BASELINE_MAP=()

for baseline in tests/baselines/*-green-v1.json; do
  [ -f "$baseline" ] || continue
  tkey=$(jq -r '.templateKey // .template_key' "$baseline")
  short=$(jq -r '.short_name // "???"' "$baseline")
  fixture=$(jq -r '.fixturePath // ""' "$baseline")
  if [ -z "$tkey" ] || [ "$tkey" = "null" ]; then continue; fi
  if [ -z "$fixture" ] || [ "$fixture" = "null" ] || [ ! -f "$fixture" ]; then continue; fi
  TEMPLATES+=("$tkey")
  FIXTURE_MAP[$tkey]="$fixture"
  SHORT_MAP[$tkey]="$short"
  BASELINE_MAP[$tkey]="$baseline"
done

TOTAL=${#TEMPLATES[@]}
if [ "$TOTAL" -eq 0 ]; then
  echo "ERROR: No GREEN templates found in tests/baselines/"
  exit 1
fi

echo "Templates discovered: $TOTAL"
for t in "${TEMPLATES[@]}"; do
  echo "  - $t (${SHORT_MAP[$t]})"
done
echo ""

# Per-template results
declare -A RESULT_STATUS=()
declare -A RESULT_JSON=()

PASS_COUNT=0
DEGRADED_COUNT=0
FAIL_COUNT=0

for tkey in "${TEMPLATES[@]}"; do
  short="${SHORT_MAP[$tkey]}"
  fixture="${FIXTURE_MAP[$tkey]}"
  baseline="${BASELINE_MAP[$tkey]}"
  STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  echo "--- [$short] $tkey ---"
  echo "  Fixture:  $fixture"
  echo "  Baseline: $baseline"

  REG_STATUS="fail"
  GEN_STATUS="unknown"
  QUALITY_STATUS="unknown"
  BASELINE_STATUS="unknown"
  FALLBACK_USED="no"
  ERROR_MSG=""

  # Step 1: Create project
  echo "  [1/6] Creating project..."
  CREATE_RESP=$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL/api/projects" \
    -H "Content-Type: application/json" \
    -d @"$fixture" 2>&1) || true

  HTTP_CODE=$(echo "$CREATE_RESP" | tail -1)
  CREATE_BODY=$(echo "$CREATE_RESP" | sed '$d')

  if [ "$HTTP_CODE" != "201" ]; then
    echo "  FAIL: Project creation returned HTTP $HTTP_CODE"
    ERROR_MSG="Project creation failed (HTTP $HTTP_CODE)"
    RESULT_STATUS[$tkey]="fail"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo ""
    continue
  fi

  PROJECT_ID=$(echo "$CREATE_BODY" | jq -r '.project.id')
  echo "  OK: Project $PROJECT_ID"

  # Step 2: Trigger generate-template
  echo "  [2/6] Triggering generate-template..."
  GEN_RESP=$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL/api/projects/$PROJECT_ID/generate-template" 2>&1) || true

  HTTP_CODE=$(echo "$GEN_RESP" | tail -1)
  if [ "$HTTP_CODE" -ge 400 ] 2>/dev/null; then
    echo "  FAIL: generate-template returned HTTP $HTTP_CODE"
    ERROR_MSG="generate-template failed (HTTP $HTTP_CODE)"
    RESULT_STATUS[$tkey]="fail"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo ""
    continue
  fi

  # Step 3: Poll for completion
  echo "  [3/6] Polling..."
  for i in $(seq 1 $MAX_POLLS); do
    PROJ_RESP=$(curl -s "$BASE_URL/api/projects/$PROJECT_ID" 2>&1) || true
    GEN_STATUS=$(echo "$PROJ_RESP" | jq -r '.generationRuns[0].status // "unknown"')

    if [ "$GEN_STATUS" = "completed" ] || [ "$GEN_STATUS" = "failed" ]; then
      break
    fi

    CURRENT_STEP=$(echo "$PROJ_RESP" | jq -r '.generationRuns[0].current_step // "?"')
    echo "  Poll $i: status=$GEN_STATUS step=$CURRENT_STEP"
    sleep "$POLL_INTERVAL"
  done

  # Step 4: Fetch final state
  echo "  [4/6] Fetching final state..."
  PROJ_RESP=$(curl -s "$BASE_URL/api/projects/$PROJECT_ID")

  QUALITY_STATUS=$(echo "$PROJ_RESP" | jq -r '.qualityRuns[0].status // "unknown"')

  # Check fallback usage
  FALLBACK_COUNT=$(echo "$PROJ_RESP" | jq '[.generationRuns[0].steps_json // [] | .[] | select(.meta.fallbackUsed == true)] | length')
  [ "$FALLBACK_COUNT" -gt 0 ] && FALLBACK_USED="yes"

  # Providers
  PROVIDERS=$(echo "$PROJ_RESP" | jq -r '[.generationRuns[0].steps_json // [] | .[].meta.provider // empty] | unique | join(", ")')

  # Cost
  COST_TOTAL=$(echo "$PROJ_RESP" | jq '[.generationRuns[0].steps_json // [] | .[].meta.estimatedCostUsd // 0] | add // 0')

  # Duration
  DURATION_TOTAL=$(echo "$PROJ_RESP" | jq '[.generationRuns[0].steps_json // [] | .[].meta.durationMs // 0] | add // 0')

  # Step 5: Baseline comparison
  echo "  [5/6] Baseline comparison..."
  BASELINE_STATUS="pass"
  if [ -f "$SCRIPT_DIR/compare-baseline.sh" ]; then
    if bash "$SCRIPT_DIR/compare-baseline.sh" "$baseline" "$PROJECT_ID" > /dev/null 2>&1; then
      BASELINE_STATUS="pass"
    else
      BASELINE_STATUS="fail"
    fi
  fi

  # Step 6: Compute regression status
  echo "  [6/6] Computing regression status..."

  FINISHED=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  if [ "$GEN_STATUS" = "completed" ] && [ "$QUALITY_STATUS" = "passed" ] && [ "$BASELINE_STATUS" = "pass" ]; then
    if [ "$FALLBACK_USED" = "yes" ]; then
      REG_STATUS="degraded"
    else
      REG_STATUS="pass"
    fi
  else
    REG_STATUS="fail"
  fi

  # Save per-template JSON summary
  SUMMARY_FILE="$RESULTS_DIR/${NIGHTLY_ID}_${short}.json"
  jq -n \
    --arg tk "$tkey" \
    --arg sn "$short" \
    --arg rid "$PROJECT_ID" \
    --arg sa "$STARTED" \
    --arg fa "$FINISHED" \
    --arg gs "$GEN_STATUS" \
    --arg qs "$QUALITY_STATUS" \
    --arg bs "$BASELINE_STATUS" \
    --arg rs "$REG_STATUS" \
    --arg fb "$FALLBACK_USED" \
    --argjson fc "$FALLBACK_COUNT" \
    --arg prov "$PROVIDERS" \
    --argjson cost "$COST_TOTAL" \
    --argjson dur "$DURATION_TOTAL" \
    --arg err "$ERROR_MSG" \
    '{
      templateKey: $tk,
      shortName: $sn,
      runId: $rid,
      startedAt: $sa,
      finishedAt: $fa,
      pipelinePassed: ($gs == "completed"),
      qualityGatesPassed: ($qs == "passed"),
      baselinePassed: ($bs == "pass"),
      fallbackUsed: ($fb == "yes"),
      fallbackCount: $fc,
      selectedProviders: ($prov | split(", ")),
      estimatedCostTotal: $cost,
      durationMsTotal: $dur,
      regressionStatus: $rs,
      errorMessage: (if $err == "" then null else $err end)
    }' > "$SUMMARY_FILE"

  RESULT_STATUS[$tkey]="$REG_STATUS"

  echo "  Result: $REG_STATUS"
  echo "  Pipeline:  $GEN_STATUS"
  echo "  Quality:   $QUALITY_STATUS"
  echo "  Baseline:  $BASELINE_STATUS"
  echo "  Providers: $PROVIDERS"
  echo "  Fallback:  $FALLBACK_USED ($FALLBACK_COUNT)"
  echo "  Cost:      \$$COST_TOTAL"
  echo "  Duration:  ${DURATION_TOTAL}ms"
  echo ""

  case "$REG_STATUS" in
    pass) PASS_COUNT=$((PASS_COUNT + 1)) ;;
    degraded) DEGRADED_COUNT=$((DEGRADED_COUNT + 1)) ;;
    fail) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
  esac
done

NIGHTLY_FINISHED=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Write consolidated report
REPORT_FILE="$RESULTS_DIR/${NIGHTLY_ID}_report.json"
jq -n \
  --arg nid "$NIGHTLY_ID" \
  --arg sa "$NIGHTLY_STARTED" \
  --arg fa "$NIGHTLY_FINISHED" \
  --argjson total "$TOTAL" \
  --argjson pass "$PASS_COUNT" \
  --argjson degraded "$DEGRADED_COUNT" \
  --argjson fail "$FAIL_COUNT" \
  '{
    nightlyRunId: $nid,
    startedAt: $sa,
    finishedAt: $fa,
    summary: {
      templatesProcessed: $total,
      passCount: $pass,
      degradedCount: $degraded,
      failCount: $fail
    }
  }' > "$REPORT_FILE"

# Print final summary
echo "=== NIGHTLY REGRESSION SUMMARY ==="
echo "Run ID:    $NIGHTLY_ID"
echo "Templates: $TOTAL"
echo "Pass:      $PASS_COUNT"
echo "Degraded:  $DEGRADED_COUNT"
echo "Fail:      $FAIL_COUNT"
echo ""
echo "Results saved to: $RESULTS_DIR/"
echo ""

for tkey in "${TEMPLATES[@]}"; do
  short="${SHORT_MAP[$tkey]}"
  status="${RESULT_STATUS[$tkey]}"
  echo "  $short  $tkey  $status"
done

# Exit 1 if any failures
if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
