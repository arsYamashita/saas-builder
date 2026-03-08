#!/usr/bin/env bash
set -euo pipefail

# Compare a regression run against the MCA GREEN v1 baseline
# Usage: bash scripts/compare-mca-baseline.sh <project-id>
# Requires: curl, jq, dev server running

if [ $# -lt 1 ]; then
  echo "Usage: $0 <project-id>"
  exit 1
fi

PROJECT_ID="$1"
BASE_URL="${BASE_URL:-http://localhost:3000}"
BASELINE_JSON="tests/baselines/membership-content-affiliate-green-v1.json"
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
GEN_RUN=$(echo "$PROJ_RESP" | jq '.project.latestGenerationRun // {}')
QUALITY_RUN=$(echo "$PROJ_RESP" | jq '.project.latestQualityRun // {}')

# --- Load baseline ---
BASELINE=$(cat "$BASELINE_JSON")

# --- 1. Generation Steps ---
echo "[1] Generation Steps"
for STEP in step_blueprint step_implementation step_schema step_api_design step_split_files step_export_files; do
  EXPECTED=$(echo "$BASELINE" | jq -r ".expectedGenerationSteps.$STEP")
  ACTUAL=$(echo "$GEN_RUN" | jq -r ".$STEP // \"missing\"")
  if [ "$ACTUAL" = "$EXPECTED" ]; then
    pass "$STEP = $ACTUAL"
  else
    fail "$STEP expected=$EXPECTED actual=$ACTUAL"
  fi
done
echo ""

# --- 2. Quality Statuses ---
echo "[2] Quality Statuses"
for STATUS in lint_status typecheck_status playwright_status; do
  EXPECTED=$(echo "$BASELINE" | jq -r ".expectedQualityStatuses.$STATUS")
  ACTUAL=$(echo "$QUALITY_RUN" | jq -r ".$STATUS // \"missing\"")
  if [ "$ACTUAL" = "$EXPECTED" ]; then
    pass "$STATUS = $ACTUAL"
  else
    fail "$STATUS expected=$EXPECTED actual=$ACTUAL"
  fi
done
echo ""

# --- 3. Minimum Counts ---
echo "[3] Saved Counts"
for KEY in blueprints implementation_runs generated_files; do
  # Map key to API response field
  case "$KEY" in
    blueprints) API_KEY="blueprintsCount" ;;
    implementation_runs) API_KEY="implementationRunsCount" ;;
    generated_files) API_KEY="generatedFilesCount" ;;
  esac
  MIN=$(echo "$BASELINE" | jq ".minimumCounts.$KEY")
  ACTUAL=$(echo "$PROJ_RESP" | jq ".project.$API_KEY // 0")
  if [ "$ACTUAL" -ge "$MIN" ]; then
    pass "$KEY = $ACTUAL (min: $MIN)"
  else
    fail "$KEY = $ACTUAL (min: $MIN)"
  fi
done
echo ""

# --- 4. Required Generated File Paths ---
echo "[4] Required Generated Files (export dir)"
if [ -d "$EXPORT_DIR" ]; then
  PATHS=$(echo "$BASELINE" | jq -r '.requiredGeneratedFilePaths[]')
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
