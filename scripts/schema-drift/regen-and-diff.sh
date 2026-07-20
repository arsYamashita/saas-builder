#!/usr/bin/env bash
# regen-and-diff.sh <migrations-dir> <generated-types-file>
# regen-and-diff.sh --all
#
# The literal "supabase gen types typescript + git diff --exit-code"
# mechanism from M5 指示書 2026-07-06_039 step 1: applies every migration
# under <migrations-dir> to a Postgres, regenerates TypeScript types with
# the real `supabase` CLI, and diffs the result against the COMMITTED
# <generated-types-file> (its `database.generated.ts` snapshot). A
# non-empty diff means the committed snapshot is stale relative to the
# live migrations — regenerate it and commit the update.
#
# `--all` mode (what CI actually runs, see
# .github/workflows/ci.yml's "Schema Drift — regen check" job): reads
# EVERY entry from scripts/schema-drift-targets.json (via `jq`) and runs
# the check for each, so a new template added to that registry gets
# freshness-checked automatically with no CI YAML change — matching what
# docs/schema-drift-guide.md already promises ("Both CI jobs pick up new
# entries automatically"). Fails (non-zero exit) if ANY target drifted;
# per-target diffs are all printed before exiting.
#
# Two ways to point this at a Postgres:
#   1. CI (GitHub Actions `services: postgres:` container): export
#      SCHEMA_DRIFT_DB_URL to the service's connection string (a bare
#      connection string with NO database name — this script creates one
#      throwaway database per target on it). This script does not start
#      or tear down that Postgres — the service container's lifecycle is
#      the job's.
#   2. Local dev (no SCHEMA_DRIFT_DB_URL set): spins up a throwaway local
#      Postgres cluster via `initdb`/`pg_ctl` under a scratch dir, applies
#      migrations, generates types, diffs, and ALWAYS tears the cluster
#      down on exit (trap), success or failure — once, regardless of how
#      many targets are checked.
#
# Networking note (see docs/schema-drift-guide.md, "Why this job is
# informational, not blocking"): `supabase gen types typescript --db-url`
# itself launches a helper Docker container (`postgres-meta`) that must
# independently reach the target Postgres — `127.0.0.1`/`localhost` as
# seen from the HOST is not reachable from INSIDE that container. This
# script tries a few well-known host aliases automatically (see
# `resolve_docker_reachable_host`), but a networking topology this script
# doesn't anticipate can still fail here even though the DB itself is
# fine — hence this check is wired as `continue-on-error: true` in CI, and
# the blocking safety net is the offline `schema-drift-gate` structural
# job (`npm run schema:drift:gate`) instead.
set -uo pipefail  # NOT -e: this script's job-level contract is "print a
                   # clear diagnostic and exit non-zero", never a bare
                   # unexplained failure — see the trap below.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TARGETS_FILE="$REPO_ROOT/scripts/schema-drift-targets.json"

TMP_PGDATA=""
STARTED_LOCAL_PG=0
PG_BASE_URL="" # connection string with no database name (SCHEMA_DRIFT_DB_URL, or the local throwaway cluster's)

cleanup() {
  if [ "$STARTED_LOCAL_PG" -eq 1 ] && [ -n "$TMP_PGDATA" ]; then
    echo "[regen-and-diff] tearing down local throwaway Postgres ..."
    "$PG_BINDIR/pg_ctl" -D "$TMP_PGDATA" -m fast stop >/dev/null 2>&1 || true
    rm -rf "$TMP_PGDATA"
  fi
}
trap cleanup EXIT

find_pg_bindir() {
  for candidate in \
    "/opt/homebrew/opt/postgresql@16/bin" \
    "/opt/homebrew/opt/postgresql@15/bin" \
    "/usr/lib/postgresql/16/bin" \
    "/usr/lib/postgresql/15/bin"
  do
    if [ -x "$candidate/initdb" ]; then
      echo "$candidate"
      return 0
    fi
  done
  if command -v initdb >/dev/null 2>&1; then
    dirname "$(command -v initdb)"
    return 0
  fi
  return 1
}

# Reachable both from THIS process and from a helper container the
# `supabase` CLI spins up on the docker bridge network — 127.0.0.1 fails
# the second half. Tries, in order: the machine's primary LAN IP (works
# for local dev with Docker Desktop for Mac), then well-known
# docker-bridge-gateway aliases (works on GitHub Actions' Linux runners).
resolve_docker_reachable_host() {
  if command -v ipconfig >/dev/null 2>&1; then
    for iface in en0 en1; do
      local ip
      ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      if [ -n "$ip" ]; then
        echo "$ip"
        return 0
      fi
    done
  fi
  if command -v hostname >/dev/null 2>&1; then
    local ip
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    if [ -n "$ip" ]; then
      echo "$ip"
      return 0
    fi
  fi
  echo "172.17.0.1" # default docker0 bridge gateway on Linux runners
}

# Establishes PG_BASE_URL (a connection string with NO database name) —
# either SCHEMA_DRIFT_DB_URL as-is, or a freshly-started local throwaway
# cluster. Idempotent: safe to call once regardless of how many targets
# run afterward.
ensure_postgres() {
  if [ -n "$PG_BASE_URL" ]; then
    return 0
  fi
  if [ -n "${SCHEMA_DRIFT_DB_URL:-}" ]; then
    echo "[regen-and-diff] using SCHEMA_DRIFT_DB_URL (CI service container mode)."
    PG_BASE_URL="$SCHEMA_DRIFT_DB_URL"
    return 0
  fi
  echo "[regen-and-diff] SCHEMA_DRIFT_DB_URL not set — starting a throwaway local Postgres."
  if ! PG_BINDIR="$(find_pg_bindir)"; then
    echo "[regen-and-diff] ERROR: no local postgresql (initdb/pg_ctl) found and SCHEMA_DRIFT_DB_URL not set." >&2
    return 2
  fi
  TMP_PGDATA="$(mktemp -d)/pgdata"
  PGPORT="${SCHEMA_DRIFT_LOCAL_PG_PORT:-54329}"
  "$PG_BINDIR/initdb" -D "$TMP_PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null
  echo "listen_addresses = '*'" >>"$TMP_PGDATA/postgresql.conf"
  echo "host all all 0.0.0.0/0 trust" >>"$TMP_PGDATA/pg_hba.conf"
  "$PG_BINDIR/pg_ctl" -D "$TMP_PGDATA" -o "-p $PGPORT" -l "$TMP_PGDATA/pg.log" start >/dev/null
  STARTED_LOCAL_PG=1
  local docker_host
  docker_host="$(resolve_docker_reachable_host)"
  PG_BASE_URL="postgresql://postgres@${docker_host}:${PGPORT}"
  return 0
}

# run_one_target <migrations-dir> <generated-types-file> [<target-name-for-logging>]
# Returns 0 = fresh, 1 = drift detected, 2/3 = the check itself failed to run.
run_one_target() {
  local migrations_dir="$1"
  local generated_types_file="$2"
  local label="${3:-$migrations_dir}"

  ensure_postgres || return 2

  local db_name
  db_name="schema_drift_check_$(echo "$label" | tr -c 'a-zA-Z0-9' '_')"
  local psql_bin="${PG_BINDIR:+$PG_BINDIR/}psql"
  command -v "$psql_bin" >/dev/null 2>&1 || psql_bin="psql"

  "$psql_bin" "${PG_BASE_URL}/postgres" -c "DROP DATABASE IF EXISTS ${db_name};" >/dev/null 2>&1 || true
  if ! "$psql_bin" "${PG_BASE_URL}/postgres" -c "CREATE DATABASE ${db_name};" >/dev/null 2>&1; then
    echo "[regen-and-diff:${label}] ERROR: could not create check database ${db_name}." >&2
    return 2
  fi
  local db_url="${PG_BASE_URL}/${db_name}"

  bash "$SCRIPT_DIR/apply-migrations.sh" "$migrations_dir" "$db_url"
  if [ $? -ne 0 ]; then
    echo "[regen-and-diff:${label}] ERROR: applying migrations to the check DB failed." >&2
    return 2
  fi

  echo "[regen-and-diff:${label}] running \`supabase gen types typescript\` ..."
  local generated_tmp
  generated_tmp="$(mktemp)"
  if ! npx --yes supabase@latest gen types typescript --db-url "$db_url" --schema public >"$generated_tmp" 2>"$generated_tmp.err"; then
    echo "[regen-and-diff:${label}] WARNING: \`supabase gen types typescript\` failed — see docs/schema-drift-guide.md, this job is informational (continue-on-error) precisely because of this class of environment issue." >&2
    cat "$generated_tmp.err" >&2
    rm -f "$generated_tmp" "$generated_tmp.err"
    return 3
  fi
  rm -f "$generated_tmp.err"

  # The committed file carries a provenance header (see
  # database.generated.ts) that a byte-for-byte regeneration won't
  # reproduce — diff only the actual `export type ...` content, from the
  # first `export type Json` line onward.
  local committed_body
  committed_body="$(mktemp)"
  awk '/^export type Json/{found=1} found' "$REPO_ROOT/$generated_types_file" >"$committed_body" 2>/dev/null || true

  local result=0
  if diff -u "$committed_body" "$generated_tmp" >/tmp/schema-drift-regen-"${db_name}".diff; then
    echo "[regen-and-diff:${label}] PASS — $generated_types_file matches the live schema. 0 drift."
  else
    echo "[regen-and-diff:${label}] DRIFT DETECTED — $generated_types_file is stale relative to $migrations_dir."
    echo "[regen-and-diff:${label}] Regenerate with: SCHEMA_DRIFT_DB_URL=<url> bash $SCRIPT_DIR/regen-and-diff.sh $migrations_dir $generated_types_file"
    echo "--- diff (committed vs. live-regenerated) ---"
    cat /tmp/schema-drift-regen-"${db_name}".diff
    result=1
  fi

  rm -f "$generated_tmp" "$committed_body"
  return $result
}

run_all_targets() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "[regen-and-diff] ERROR: --all mode requires \`jq\` (used to read scripts/schema-drift-targets.json)." >&2
    exit 2
  fi
  if [ ! -f "$TARGETS_FILE" ]; then
    echo "[regen-and-diff] ERROR: $TARGETS_FILE not found." >&2
    exit 2
  fi
  local count
  count="$(jq 'length' "$TARGETS_FILE")"
  if [ "$count" -eq 0 ]; then
    echo "[regen-and-diff] ERROR: $TARGETS_FILE is an empty array — refusing to report success from a run that checked nothing." >&2
    exit 2
  fi

  local overall=0
  for i in $(seq 0 $((count - 1))); do
    local name migrations_dir generated_types_file
    name="$(jq -r ".[$i].name" "$TARGETS_FILE")"
    migrations_dir="$(jq -r ".[$i].migrationsDir" "$TARGETS_FILE")"
    generated_types_file="$(jq -r ".[$i].generatedTypesFile" "$TARGETS_FILE")"
    echo ""
    echo "=== [regen-and-diff] target: $name ==="
    run_one_target "$REPO_ROOT/$migrations_dir" "$generated_types_file" "$name"
    local rc=$?
    if [ $rc -ne 0 ]; then
      overall=$rc
    fi
  done
  exit $overall
}

if [ "${1:-}" = "--all" ]; then
  run_all_targets
  # run_all_targets always exits internally.
fi

MIGRATIONS_DIR="${1:?usage: regen-and-diff.sh <migrations-dir> <generated-types-file>  |  regen-and-diff.sh --all}"
GENERATED_TYPES_FILE="${2:?usage: regen-and-diff.sh <migrations-dir> <generated-types-file>  |  regen-and-diff.sh --all}"

run_one_target "$MIGRATIONS_DIR" "$GENERATED_TYPES_FILE"
exit $?
