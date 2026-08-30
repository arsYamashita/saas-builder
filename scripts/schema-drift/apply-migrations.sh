#!/usr/bin/env bash
# apply-migrations.sh <migrations-dir> <postgres-url>
#
# Applies every *.sql file in <migrations-dir> (sorted by filename, same
# order Supabase itself applies migrations in) to <postgres-url>, after
# first stubbing out the `auth` schema (auth.users + auth.uid()) that
# every Supabase-style migration set implicitly depends on via
# `REFERENCES auth.users(id)` — a throwaway/CI Postgres has no Supabase
# platform installed, so this FK target does not exist without the stub.
#
# Used by both scripts/schema-drift/regen-and-diff.sh (regenerates +
# diffs the committed database.generated.ts snapshot) and can be run
# standalone for manual inspection (`psql` into the resulting DB).
set -euo pipefail

MIGRATIONS_DIR="${1:?usage: apply-migrations.sh <migrations-dir> <postgres-url>}"
DB_URL="${2:?usage: apply-migrations.sh <migrations-dir> <postgres-url>}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "[apply-migrations] migrations dir not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

echo "[apply-migrations] stubbing auth schema (auth.users, auth.uid()) ..."
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT NULL::uuid
$$ LANGUAGE sql STABLE;
SQL

shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
if [ ${#files[@]} -eq 0 ]; then
  echo "[apply-migrations] no *.sql files found under $MIGRATIONS_DIR — refusing to report success with nothing applied." >&2
  exit 1
fi

# Sort by filename — matches Supabase's own migration ordering convention
# (numeric prefix), and matches the order these files are already applied
# in by `supabase db push` / `supabase migration up` in a real project.
IFS=$'\n' sorted=($(printf '%s\n' "${files[@]}" | sort))
unset IFS

for f in "${sorted[@]}"; do
  echo "[apply-migrations] applying $f ..."
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

echo "[apply-migrations] applied ${#sorted[@]} migration file(s) from $MIGRATIONS_DIR."
