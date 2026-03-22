#!/usr/bin/env bash
set -euo pipefail

# Compare a regression run against the internal_admin_ops_saas GREEN v1 baseline
# Usage: bash scripts/compare-iao-baseline.sh <project-id>
# Requires: curl, jq, dev server running
#
# API response structure:
#   .generationRuns[0].steps_json[]   — {key, status}
#   .qualityRuns[0].checks_json[]     — {key, status}
#   .blueprints, .implementationRuns, .generatedFiles — arrays

if [ $# -lt 1 ]; then
  echo "Usage: $0 <project-id>"
  exit 1
fi

PROJECT_ID="$1"
BASE_URL="${BASE_URL:-http://localhost:3000}"
BASELINE_JSON="tests/baselines/internal-admin-ops-green-v1.json"
EXPORT_DIR="exports/projects/$PROJECT_ID"

PASS_COUNT=0
FAIL_COUNT=0

pass() { echo "  PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "  FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

echo "=== Baseline Comparison ==="
echo "Project:  $PROJECT_ID"
echo "Baseline: $BASELINE_JSON"
echo ""

# --- Fetch project data ---
PROJ_RESP=$(curl -s "$BASE_URL/api/projects/$PROJECT_ID")

# --- Load baseline ---
BASELINE=$(cat "$BASELINE_JSON")

# --- 1. Generation Steps ---
echo "[1] Generation Steps"
EXPECTED_STEPS=$(echo "$BASELINE" | jq -r '.expectedGenerationSteps | to_entries[] | "\(.key)=\(.value)"')
for ENTRY in $EXPECTED_STEPS; do
  STEP_KEY="${ENTRY%%=*}"
  EXPECTED_STATUS="${ENTRY#*=}"
  ACTUAL=$(echo "$PROJ_RESP" | jq -r --arg k "$STEP_KEY" '[.generationRuns[0].steps_json // [] | .[] | select(.key==$k)][0].status // "missing"')
  if [ "$ACTUAL" = "$EXPECTED_STATUS" ]; then
    pass "$STEP_KEY = $ACTUAL"
  else
    fail "$STEP_KEY expected=$EXPECTED_STATUS actual=$ACTUAL"
  fi
done
echo ""

# --- 2. Quality Statuses ---
echo "[2] Quality Statuses"
EXPECTED_CHECKS=$(echo "$BASELINE" | jq -r '.expectedQualityStatuses | to_entries[] | "\(.key)=\(.value)"')
for ENTRY in $EXPECTED_CHECKS; do
  CHECK_KEY="${ENTRY%%=*}"
  EXPECTED_STATUS="${ENTRY#*=}"
  ACTUAL=$(echo "$PROJ_RESP" | jq -r --arg k "$CHECK_KEY" '[.qualityRuns[0].checks_json // [] | .[] | select(.key==$k)][0].status // "missing"')
  if [ "$ACTUAL" = "$EXPECTED_STATUS" ]; then
    pass "$CHECK_KEY = $ACTUAL"
  else
    fail "$CHECK_KEY expected=$EXPECTED_STATUS actual=$ACTUAL"
  fi
done
echo ""

# --- 3. Minimum Counts ---
echo "[3] Saved Counts"
for KEY in blueprints implementation_runs generated_files; do
  case "$KEY" in
    blueprints) API_KEY="blueprints" ;;
    implementation_runs) API_KEY="implementationRuns" ;;
    generated_files) API_KEY="generatedFiles" ;;
  esac
  MIN=$(echo "$BASELINE" | jq ".minimumCounts.$KEY")
  ACTUAL=$(echo "$PROJ_RESP" | jq ".$API_KEY | length")
  if [ "$ACTUAL" -ge "$MIN" ]; then
    pass "$KEY = $ACTUAL (min: $MIN)"
  else
    fail "$KEY = $ACTUAL (min: $MIN)"
  fi
done
echo ""

# --- 4. Required Export Checks ---
echo "[4] Required Export Checks (export dir)"
if [ -d "$EXPORT_DIR" ]; then
  CHECK_COUNT=$(echo "$BASELINE" | jq '.requiredExportChecks | length')
  for idx in $(seq 0 $((CHECK_COUNT - 1))); do
    DESC=$(echo "$BASELINE" | jq -r ".requiredExportChecks[$idx].description")
    DIR=$(echo "$BASELINE" | jq -r ".requiredExportChecks[$idx].dir")
    EXT=$(echo "$BASELINE" | jq -r ".requiredExportChecks[$idx].extension")
    MIN=$(echo "$BASELINE" | jq ".requiredExportChecks[$idx].minCount")
    MATCH_COUNT=$(find "$EXPORT_DIR/$DIR" -name "*$EXT" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$MATCH_COUNT" -ge "$MIN" ]; then
      pass "$DESC ($MATCH_COUNT found)"
    else
      fail "$DESC (found $MATCH_COUNT, min $MIN)"
    fi
  done
else
  fail "Export directory not found: $EXPORT_DIR"
fi
echo ""

# --- 5. Required Scaffold File Paths ---
echo "[5] Required Scaffold Files (export dir)"
if [ -d "$EXPORT_DIR" ]; then
  PATHS=$(echo "$BASELINE" | jq -r '.requiredScaffoldFilePaths[]')
  for P in $PATHS; do
    if [ -f "$EXPORT_DIR/$P" ]; then
      pass "$P exists"
    else
      fail "$P missing"
    fi
  done
else
  fail "Export directory not found: $EXPORT_DIR"
fi
echo ""

# --- Summary ---
TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo "=== COMPARISON RESULT ==="
echo "  Passed: $PASS_COUNT / $TOTAL"
echo "  Failed: $FAIL_COUNT / $TOTAL"
echo ""
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "BASELINE COMPARISON: PASS"
else
  echo "BASELINE COMPARISON: FAIL"
fi
