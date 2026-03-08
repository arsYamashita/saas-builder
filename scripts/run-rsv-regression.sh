#!/usr/bin/env bash
set -euo pipefail

# reservation_saas regression test runner
# Requires: curl, jq, dev server running on localhost:3000
#
# API response structure:
#   .generationRuns[0].status          — "completed" | "failed" | "running"
#   .generationRuns[0].current_step    — current step name or null
#   .generationRuns[0].steps_json[]    — {key, label, status}
#   .qualityRuns[0].status             — "passed" | "failed"
#   .qualityRuns[0].checks_json[]      — {key, label, status, stdout}
#   .blueprints, .implementationRuns, .generatedFiles — arrays

BASE_URL="${BASE_URL:-http://localhost:3000}"
FIXTURE="tests/fixtures/reservation-saas-first-run.json"
POLL_INTERVAL=10
MAX_POLLS=60

echo "=== RSV Regression Test ==="
echo "Base URL: $BASE_URL"
echo "Fixture:  $FIXTURE"
echo ""

# --- Step 1: Create project ---
echo "[1/5] Creating project..."
CREATE_RESP=$(curl -s -w "\n%{http_code}" \
  -X POST "$BASE_URL/api/projects" \
  -H "Content-Type: application/json" \
  -d @"$FIXTURE")

HTTP_CODE=$(echo "$CREATE_RESP" | tail -1)
CREATE_BODY=$(echo "$CREATE_RESP" | sed '$d')

if [ "$HTTP_CODE" != "201" ]; then
  echo "FAIL: Project creation returned HTTP $HTTP_CODE"
  echo "$CREATE_BODY" | jq . 2>/dev/null || echo "$CREATE_BODY"
  exit 1
fi

PROJECT_ID=$(echo "$CREATE_BODY" | jq -r '.project.id')
echo "OK: Project created: $PROJECT_ID"
echo ""

# --- Step 2: Trigger generate-template ---
echo "[2/5] Triggering generate-template..."
GEN_RESP=$(curl -s -w "\n%{http_code}" \
  -X POST "$BASE_URL/api/projects/$PROJECT_ID/generate-template")

HTTP_CODE=$(echo "$GEN_RESP" | tail -1)
GEN_BODY=$(echo "$GEN_RESP" | sed '$d')

if [ "$HTTP_CODE" -ge 400 ]; then
  echo "FAIL: generate-template returned HTTP $HTTP_CODE"
  echo "$GEN_BODY" | jq . 2>/dev/null || echo "$GEN_BODY"
  exit 1
fi

echo "OK: Generation started"
echo ""

# --- Step 3: Poll for generation completion ---
echo "[3/5] Polling generation status..."
GEN_STATUS="unknown"
for i in $(seq 1 $MAX_POLLS); do
  PROJ_RESP=$(curl -s "$BASE_URL/api/projects/$PROJECT_ID")
  GEN_STATUS=$(echo "$PROJ_RESP" | jq -r '.generationRuns[0].status // "unknown"')

  if [ "$GEN_STATUS" = "completed" ] || [ "$GEN_STATUS" = "failed" ]; then
    break
  fi

  CURRENT_STEP=$(echo "$PROJ_RESP" | jq -r '.generationRuns[0].current_step // "unknown"')
  echo "  Poll $i: status=$GEN_STATUS step=$CURRENT_STEP"
  sleep "$POLL_INTERVAL"
done

echo ""

# --- Step 4: Fetch final project state ---
echo "[4/5] Fetching final project state..."
PROJ_RESP=$(curl -s "$BASE_URL/api/projects/$PROJECT_ID")

# --- Step 5: Display results ---
echo "[5/5] Results"
echo ""
echo "--- Project ---"
echo "  ID: $PROJECT_ID"
echo ""

echo "--- Generation Run ---"
echo "$PROJ_RESP" | jq -r '
  .generationRuns[0] // {} |
  "  status:        \(.status // "N/A")\n  current_step:  \(.current_step // "N/A")\n  error_message: \(.error_message // "none")"
'
echo ""

echo "--- Generation Steps ---"
echo "$PROJ_RESP" | jq -r '
  .generationRuns[0].steps_json // [] | .[] |
  "  \(.key):\t\(.status)"
'
echo ""

echo "--- Quality Run ---"
echo "$PROJ_RESP" | jq -r '
  .qualityRuns[0] // {} |
  "  status: \(.status // "N/A")"
'
echo "$PROJ_RESP" | jq -r '
  .qualityRuns[0].checks_json // [] | .[] |
  "  \(.key):\t\(.status)"
'
echo ""

echo "--- Saved Counts ---"
BLUEPRINTS=$(echo "$PROJ_RESP" | jq '.blueprints | length')
IMPL_RUNS=$(echo "$PROJ_RESP" | jq '.implementationRuns | length')
GEN_FILES=$(echo "$PROJ_RESP" | jq '.generatedFiles | length')
echo "  blueprints:          $BLUEPRINTS"
echo "  implementation_runs: $IMPL_RUNS"
echo "  generated_files:     $GEN_FILES"
echo ""

# --- Summary ---
LINT=$(echo "$PROJ_RESP" | jq -r '[.qualityRuns[0].checks_json // [] | .[] | select(.key=="lint")][0].status // "unknown"')
TYPECHECK=$(echo "$PROJ_RESP" | jq -r '[.qualityRuns[0].checks_json // [] | .[] | select(.key=="typecheck")][0].status // "unknown"')
PLAYWRIGHT=$(echo "$PROJ_RESP" | jq -r '[.qualityRuns[0].checks_json // [] | .[] | select(.key=="playwright")][0].status // "unknown"')

echo "=== REGRESSION SUMMARY ==="
if [ "$GEN_STATUS" = "completed" ] && [ "$LINT" = "passed" ] && [ "$TYPECHECK" = "passed" ] && [ "$PLAYWRIGHT" = "passed" ]; then
  echo "RESULT: GREEN"
else
  echo "RESULT: NOT GREEN"
  echo "  generation: $GEN_STATUS"
  echo "  lint:       $LINT"
  echo "  typecheck:  $TYPECHECK"
  echo "  playwright: $PLAYWRIGHT"
fi
echo ""

# --- Step 6: Baseline Comparison ---
echo ""
echo "=== BASELINE COMPARISON ==="
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/compare-rsv-baseline.sh" "$PROJECT_ID"
