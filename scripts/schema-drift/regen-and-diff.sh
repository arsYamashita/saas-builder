#!/usr/bin/env bash
# regen-and-diff.sh <migrations-dir> <generated-types-file>
#
# The literal "supabase gen types typescript + git diff --exit-code"
# mechanism from M5 指示書 2026-07-06_039 step 1: applies every migration
# under <migrations-dir> to a Postgres, regenerates TypeScript types with
# the real `supabase` CLI, and diffs the result against the COMMITTED
# <generated-types-file> (its `database.generated.ts` snapshot). A
# non-empty diff means the committed snapshot is stale relative to the
# live migrations — regenerate it and commit the update.
#
# Two ways to point this at a Postgres:
#   1. CI (GitHub Actions `services: postgres:` container): export
#      SCHEMA_DRIFT_DB_URL to the service's connection string. This script
#      applies migrations to it directly — no local Postgres is started or
#      torn down (the service container's lifecycle is the job's).
#   2. Local dev (no SCHEMA_DRIFT_DB_URL set): spins up a throwaway local
#      Postgres cluster via `initdb`/`pg_ctl` under a scratch dir, applies
#      migrations, generates types, diffs, and ALWAYS tears the cluster
#      down on exit (trap), success or failure.
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

MIGRATIONS_DIR="${1:?usage: regen-and-diff.sh <migrations-dir> <generated-types-file>}"
GENERATED_TYPES_FILE="${2:?usage: regen-and-diff.sh <migrations-dir> <generated-types-file>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TMP_PGDATA=""
STARTED_LOCAL_PG=0

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
  # Fall back to whatever's on PATH.
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

if [ -n "${SCHEMA_DRIFT_DB_URL:-}" ]; then
  echo "[regen-and-diff] using SCHEMA_DRIFT_DB_URL (CI service container mode)."
  DB_URL="$SCHEMA_DRIFT_DB_URL"
  GEN_TYPES_URL="$SCHEMA_DRIFT_DB_URL"
else
  echo "[regen-and-diff] SCHEMA_DRIFT_DB_URL not set — starting a throwaway local Postgres."
  if ! PG_BINDIR="$(find_pg_bindir)"; then
    echo "[regen-and-diff] ERROR: no local postgresql (initdb/pg_ctl) found and SCHEMA_DRIFT_DB_URL not set." >&2
    exit 2
  fi
  TMP_PGDATA="$(mktemp -d)/pgdata"
  PGPORT="${SCHEMA_DRIFT_LOCAL_PG_PORT:-54329}"
  "$PG_BINDIR/initdb" -D "$TMP_PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null
  echo "listen_addresses = '*'" >>"$TMP_PGDATA/postgresql.conf"
  echo "host all all 0.0.0.0/0 trust" >>"$TMP_PGDATA/pg_hba.conf"
  "$PG_BINDIR/pg_ctl" -D "$TMP_PGDATA" -o "-p $PGPORT" -l "$TMP_PGDATA/pg.log" start >/dev/null
  STARTED_LOCAL_PG=1
  DOCKER_HOST_IP="$(resolve_docker_reachable_host)"
  "$PG_BINDIR/psql" -h "$DOCKER_HOST_IP" -p "$PGPORT" -U postgres -d postgres -c "CREATE DATABASE schema_drift_check;" >/dev/null
  DB_URL="postgresql://postgres@${DOCKER_HOST_IP}:${PGPORT}/schema_drift_check"
  GEN_TYPES_URL="$DB_URL"
fi

bash "$SCRIPT_DIR/apply-migrations.sh" "$MIGRATIONS_DIR" "$DB_URL"
if [ $? -ne 0 ]; then
  echo "[regen-and-diff] ERROR: applying migrations to the check DB failed." >&2
  exit 2
fi

echo "[regen-and-diff] running \`supabase gen types typescript\` ..."
GENERATED_TMP="$(mktemp)"
if ! npx --yes supabase@latest gen types typescript --db-url "$GEN_TYPES_URL" --schema public >"$GENERATED_TMP" 2>"$GENERATED_TMP.err"; then
  echo "[regen-and-diff] WARNING: \`supabase gen types typescript\` failed — see docs/schema-drift-guide.md, this job is informational (continue-on-error) precisely because of this class of environment issue." >&2
  cat "$GENERATED_TMP.err" >&2
  rm -f "$GENERATED_TMP" "$GENERATED_TMP.err"
  exit 3
fi
rm -f "$GENERATED_TMP.err"

# The committed file carries a provenance header (see
# database.generated.ts) that a byte-for-byte regeneration won't
# reproduce — diff only the actual `export type ...` content, from the
# first `export type Json` line onward.
COMMITTED_BODY="$(mktemp)"
awk '/^export type Json/{found=1} found' "$GENERATED_TYPES_FILE" >"$COMMITTED_BODY" 2>/dev/null || true

if diff -u "$COMMITTED_BODY" "$GENERATED_TMP" >/tmp/schema-drift-regen.diff; then
  echo "[regen-and-diff] PASS — $GENERATED_TYPES_FILE matches the live schema. 0 drift."
  rm -f "$GENERATED_TMP" "$COMMITTED_BODY"
  exit 0
else
  echo "[regen-and-diff] DRIFT DETECTED — $GENERATED_TYPES_FILE is stale relative to $MIGRATIONS_DIR."
  echo "[regen-and-diff] Regenerate with: SCHEMA_DRIFT_DB_URL=<url> bash $SCRIPT_DIR/regen-and-diff.sh $MIGRATIONS_DIR $GENERATED_TYPES_FILE"
  echo "--- diff (committed vs. live-regenerated) ---"
  cat /tmp/schema-drift-regen.diff
  rm -f "$GENERATED_TMP" "$COMMITTED_BODY"
  exit 1
fi
