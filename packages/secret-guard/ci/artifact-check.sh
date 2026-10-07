#!/bin/bash
#
# secret-guard artifact check: forbidden filenames + zip-inner entry names.
#
# gitleaks scans text diffs; it does not look inside archives. A
# `terraform plan -out=tfplan` file is a zip that embeds terraform.tfstate
# (with resolved secrets) and passes a gitleaks scan untouched. This check
# closes that gap by (a) rejecting forbidden file names and (b) listing the
# entry names of every zip-format file and rejecting forbidden entries.
#
# Usage:
#   artifact-check.sh [file ...]   check working-tree files (no args =>
#                                  every file from `git ls-files`)
#   artifact-check.sh --staged     check the STAGED index: names from
#                                  `git diff --cached`, content from the
#                                  staged blob (`git cat-file blob :path`),
#                                  never from the working tree. Used by the
#                                  pre-commit hook.
# Rules:  forbidden-names.txt next to this script.
# Output: file name + matched rule only. File contents are never printed.
# Exit:   0 clean, 1 violation or any unusable state (fail-closed).
#
# Design notes
# - Zip detection does not rely on the 4-byte PK\x03\x04 magic alone: every
#   file is also probed with `unzip -Z1`, so a zip with prepended data
#   (self-extracting) is still inspected. unzip rc 9 = "not a zip".
# - Nested archives (an archive entry that is itself an archive, by name or
#   by magic) are rejected, not recursed into: fail closed.
# - Names are never matched line-wise across a newline: a path or zip entry
#   containing a newline/CR is rejected outright, so it can never be
#   partially exempted by the allowlist.
# - Any enumeration / read failure is a failure, never "nothing to check".
# - KB "pipefail subshell die": never exit inside a pipe or subshell. All
#   failures are appended to FAILURES and there is ONE exit at the end.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES="$HERE/forbidden-names.txt"

FAILURES=""
add_failure() { FAILURES="${FAILURES}$1"$'\n'; }

finish() {
  if [ -n "$FAILURES" ]; then
    echo "artifact-check: FAILED" >&2
    printf '%s' "$FAILURES" >&2
    echo "Edit packages/secret-guard/ci/forbidden-names.txt only if this is a false positive." >&2
    exit 1
  fi
  echo "artifact-check: OK ($CHECKED file(s) checked)"
  exit 0
}

CHECKED=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ ! -r "$RULES" ]; then
  echo "artifact-check: cannot read $RULES (fail-closed)" >&2
  exit 1
fi

# Split rules file into forbidden / allow regex lists (newline separated).
FORBID=""
ALLOW=""
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ''|'#'*) continue ;;
    '!'*) ALLOW="${ALLOW}${line#!}"$'\n' ;;
    *) FORBID="${FORBID}${line}"$'\n' ;;
  esac
done < "$RULES"

# Prints the first matching forbidden regex for the (single-line) name $1.
# Allowlisted names print nothing. Always returns 0.
match_forbidden() {
  local name="$1" re
  while IFS= read -r re; do
    [ -n "$re" ] || continue
    if printf '%s\n' "$name" | grep -Eq -- "$re"; then return 0; fi
  done <<< "$ALLOW"
  while IFS= read -r re; do
    [ -n "$re" ] || continue
    if printf '%s\n' "$name" | grep -Eq -- "$re"; then
      printf '%s' "$re"
      return 0
    fi
  done <<< "$FORBID"
  return 0
}

# True if the name contains a newline or carriage return.
has_line_break() {
  case "$1" in
    *$'\n'*|*$'\r'*) return 0 ;;
  esac
  return 1
}

# Printable form of a name (line breaks escaped) for failure messages.
show() { printf '%s' "$1" | tr '\n\r' '??'; }

ARCHIVE_RE='\.(zip|jar|war|tgz|tar\.gz|tar|gz|7z|rar)$'

HAVE_UNZIP=1
command -v unzip >/dev/null 2>&1 || HAVE_UNZIP=0

# inspect_content <display-name> <content-path>
inspect_content() {
  local name="$1" content="$2" magic rc irc inner listing count expected entry rule lower esc
  if ! magic="$(od -An -tx1 -N4 -- "$content" 2>/dev/null | tr -d ' \n')"; then
    add_failure "UNREADABLE FILE: $(show "$name") (cannot read header, fail-closed)"
    return 0
  fi
  local pk=0
  [ "$magic" = "504b0304" ] && pk=1

  if [ "$HAVE_UNZIP" -eq 0 ]; then
    # Cannot tell whether this is an archive without unzip: fail closed.
    add_failure "UNZIP MISSING: cannot inspect $(show "$name") (fail-closed)"
    return 0
  fi

  rc=0
  listing="$(unzip -Z1 -- "$content" 2>/dev/null)" || rc=$?
  case "$rc" in
    0|1) : ;;   # 1 = warnings (e.g. extra bytes at beginning): still an archive
    9)
      if [ "$pk" -eq 1 ]; then
        add_failure "UNREADABLE ARCHIVE: $(show "$name") (PK header but no central directory, fail-closed)"
      fi
      return 0 ;;
    *)
      add_failure "UNREADABLE ARCHIVE: $(show "$name") (unzip rc=$rc, fail-closed)"
      return 0 ;;
  esac

  # Entry-count cross-check: an entry name containing a newline would be
  # split by the line-based listing; the count from `unzip -Z -t` exposes it.
  expected="$(unzip -Z -t -- "$content" 2>/dev/null | grep -Eo '^[0-9]+ file' | grep -Eo '^[0-9]+' || true)"
  if [ -n "$listing" ]; then
    count="$(printf '%s\n' "$listing" | wc -l | tr -d ' ')"
  else
    count=0
  fi
  if [ -z "$expected" ] && [ "$count" -gt 0 ]; then
    add_failure "UNREADABLE ARCHIVE: $(show "$name") (cannot verify entry count, fail-closed)"
    return 0
  fi
  if [ "${expected:-0}" != "$count" ]; then
    add_failure "FORBIDDEN ZIP ENTRY: $(show "$name") -> entry name containing a line break (listed $count of ${expected:-0}, fail-closed)"
    return 0
  fi

  [ -n "$listing" ] || return 0
  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    case "$entry" in */) continue ;; esac   # directory entry
    rule="$(match_forbidden "$entry")"
    if [ -n "$rule" ]; then
      add_failure "FORBIDDEN ZIP ENTRY: $(show "$name") -> $entry  (rule: $rule)"
      continue
    fi
    lower="$(printf '%s' "$entry" | tr '[:upper:]' '[:lower:]')"
    case "$lower" in
      *tfstate*) add_failure "FORBIDDEN ZIP ENTRY: $(show "$name") -> $entry  (rule: contains 'tfstate')"; continue ;;
      *credentials*) add_failure "FORBIDDEN ZIP ENTRY: $(show "$name") -> $entry  (rule: contains 'credentials')"; continue ;;
    esac
    # Nested archives are not recursed into: reject (fail closed).
    if printf '%s\n' "$lower" | grep -Eq -- "$ARCHIVE_RE"; then
      add_failure "NESTED ARCHIVE: $(show "$name") -> $entry  (nested archive not allowed)"
      continue
    fi
    # Decide robustly whether the inner entry is itself an archive: extract
    # it to a temp file (explicit exit-code check, stdin closed so an
    # encrypted entry cannot prompt) and apply the SAME test as the outer
    # level (`unzip -Z1`, rc 0/1 = archive, rc 9 = not an archive). Any
    # failure to read or classify the entry is rejected (fail-closed).
    esc="$entry"
    esc="${esc//\\/\\\\}"; esc="${esc//\*/\\*}"; esc="${esc//\?/\\?}"; esc="${esc//\[/\\[}"
    inner="$TMP/inner.bin"
    if ! unzip -p -- "$content" "$esc" > "$inner" 2>/dev/null </dev/null; then
      add_failure "NESTED ARCHIVE: $(show "$name") -> $entry  (nested archive not allowed: inner entry cannot be read, e.g. encrypted; fail-closed)"
      continue
    fi
    irc=0
    unzip -Z1 -- "$inner" >/dev/null 2>&1 </dev/null || irc=$?
    case "$irc" in
      9) : ;;   # readable and not an archive
      *) add_failure "NESTED ARCHIVE: $(show "$name") -> $entry  (nested archive not allowed: inner entry is an archive or could not be classified, unzip rc=$irc)"
         continue ;;
    esac
  done <<< "$listing"
}

# check_one <name> <content-path-or-empty>
check_one() {
  local name="$1" content="$2" rule
  CHECKED=$((CHECKED + 1))
  if has_line_break "$name"; then
    add_failure "FORBIDDEN NAME: $(show "$name")  (rule: file name contains a line break)"
    return 0
  fi
  rule="$(match_forbidden "$name")"
  if [ -n "$rule" ]; then
    add_failure "FORBIDDEN NAME: $name  (rule: $rule)"
  fi
  [ -n "$content" ] || return 0
  inspect_content "$name" "$content"
}

MODE="files"
if [ "${1:-}" = "--staged" ]; then
  MODE="staged"
  shift
fi

if [ "$MODE" = "staged" ]; then
  if ! git diff --cached --name-only --diff-filter=ACMR -z > "$TMP/names" 2>"$TMP/err"; then
    echo "artifact-check: cannot enumerate staged files (git diff --cached failed, fail-closed)" >&2
    exit 1
  fi
  n=0
  while IFS= read -r -d '' f; do
    n=$((n + 1))
    blob="$TMP/blob"
    mode=""
    if ! mode="$(git ls-files -s -z -- ":(literal)$f" 2>/dev/null | tr '\0' '\n' | cut -d' ' -f1 | head -n1)"; then
      add_failure "UNREADABLE INDEX ENTRY: $(show "$f") (fail-closed)"
      check_one "$f" ""
      continue
    fi
    if [ "$mode" = "160000" ]; then   # submodule gitlink: no blob
      check_one "$f" ""
      continue
    fi
    if git cat-file blob ":$f" > "$blob" 2>/dev/null; then
      check_one "$f" "$blob"
    else
      add_failure "UNREADABLE INDEX ENTRY: $(show "$f") (git cat-file blob failed, fail-closed)"
      check_one "$f" ""
    fi
  done < "$TMP/names"
  finish
fi

# files mode
if [ "$#" -gt 0 ]; then
  for f in "$@"; do
    if [ -f "$f" ]; then
      if [ -r "$f" ]; then
        check_one "$f" "$f"
      else
        add_failure "UNREADABLE FILE: $(show "$f") (fail-closed)"
        check_one "$f" ""
      fi
    else
      check_one "$f" ""   # missing / non-regular: name check only
    fi
  done
else
  if ! git ls-files -z > "$TMP/names" 2>"$TMP/err"; then
    echo "artifact-check: cannot enumerate files (git ls-files failed, fail-closed)" >&2
    exit 1
  fi
  while IFS= read -r -d '' f; do
    if [ -f "$f" ] && [ -r "$f" ]; then
      check_one "$f" "$f"
    else
      check_one "$f" ""
    fi
  done < "$TMP/names"
fi
finish
