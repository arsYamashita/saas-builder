/**
 * Core (side-effect-free) logic for the "schema drift gate"
 * (M5 指示書 2026-07-06_039).
 *
 * Same class of bug as [[daycare_dashboard_type_schema_drift]] /
 * `aria_app_collection_drift`: a hand-written DB row type quietly stops
 * matching the real schema (a migration adds/renames/drops a column, the
 * hand type isn't updated), and reading a field that doesn't exist on the
 * real row produces `undefined` at runtime — NOT a compile error, NOT a
 * thrown exception. The value silently disappears from the UI.
 *
 * This module compares two ALREADY-PARSED column maps:
 *   - the REAL schema, extracted from a `supabase gen types typescript`
 *     snapshot (the actual source of truth — see
 *     `scripts/schema-drift/regen-and-diff.sh` for how that snapshot gets
 *     produced/refreshed against live migrations)
 *   - a hand-written per-table type file (e.g.
 *     `templates/community_membership_saas/src/types/database.ts`)
 *
 * via an explicit `{ HandTypeName: "table_name" }` mapping (never guessed
 * from pluralization/naming heuristics — those are exactly the kind of
 * "probably right" logic that produces silent false negatives).
 *
 * Kept side-effect-free (pure functions over in-memory strings / maps) so
 * scripts/__tests__/schema-drift-gate-core.test.ts can assert on fixtures
 * without touching the filesystem, docker, or a live Postgres — the CLI
 * wrapper (scripts/schema-drift-gate-check.ts) is the only part that reads
 * files, same split as scripts/security-gate-core.ts /
 * scripts/security-gate-check.ts.
 *
 * IMPORTANT (see [[auto_scan_output_empty_silent_success]]): these
 * functions only ever report findings they actually computed from
 * non-empty input maps. The CLI wrapper is responsible for treating "the
 * generated-types file doesn't exist" / "the mapping config is missing"
 * as a hard error, never as "0 findings".
 */

// ─── Generated (`supabase gen types typescript`) parsing ───

/**
 * Finds the substring immediately after `key: {` (or `key : {`) starting
 * the search at `fromIndex`, and returns the balanced-brace body up to
 * (excluding) the matching closing `}`, plus the index just past that
 * closing brace. Returns null if the key isn't found.
 *
 * Brace-balanced (not a non-greedy regex `.*?\}`) so this doesn't
 * mis-terminate on the first unrelated `}` inside the block — the
 * generated types file nests `Row` / `Insert` / `Update` / `Relationships`
 * inside each table, and table blocks inside `Tables`, inside `public`.
 */
export function findBalancedKeyBlock(
  content: string,
  key: string,
  fromIndex = 0
): { body: string; afterIndex: number } | null {
  const keyRe = new RegExp(`(^|[\\s,{])${key}\\s*:\\s*\\{`, "g");
  keyRe.lastIndex = fromIndex;
  const m = keyRe.exec(content);
  if (!m) return null;

  const openBraceIndex = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = openBraceIndex; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") {
      depth--;
      if (depth === 0) {
        return { body: content.slice(openBraceIndex + 1, i), afterIndex: i + 1 };
      }
    }
  }
  throw new Error(
    `[schema-drift-gate] unbalanced braces while extracting "${key}" block (started at index ${openBraceIndex})`
  );
}

/**
 * Splits a `Tables: { ... }` body into its direct-child table blocks
 * (`table_name: { Row: {...}, Insert: {...}, ... }`), without descending
 * into their nested content. Returns `{ tableName -> blockBody }`.
 */
export function splitTopLevelTableBlocks(tablesBody: string): Map<string, string> {
  const out = new Map<string, string>();
  const entryRe = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{/g;
  let match: RegExpExecArray | null;
  let searchFrom = 0;
  while ((match = execFrom(entryRe, tablesBody, searchFrom))) {
    const tableName = match[1];
    // findBalancedKeyBlock's key-boundary regex requires a delimiter
    // character ([\s,{] or start-of-string) immediately BEFORE the key —
    // start the search one character earlier (at that delimiter, which
    // `match.index - 1` always is, since `entryRe` just matched
    // "<tableName>: {" starting exactly at `match.index`) so the
    // delimiter itself is within the searchable range.
    const block = findBalancedKeyBlock(tablesBody, tableName, Math.max(0, match.index - 1));
    if (!block) {
      // Should be unreachable (we just matched `tableName: {` at this
      // exact position) — treat as a hard parse error rather than
      // silently skipping a table.
      throw new Error(
        `[schema-drift-gate] failed to extract balanced block for table "${tableName}"`
      );
    }
    out.set(tableName, block.body);
    searchFrom = block.afterIndex;
    entryRe.lastIndex = searchFrom;
  }
  return out;
}

function execFrom(re: RegExp, content: string, fromIndex: number): RegExpExecArray | null {
  re.lastIndex = fromIndex;
  return re.exec(content);
}

/** Extracts `{ fieldName -> declared }` from a `Row: { ... }` body's direct lines. */
export function extractFieldNames(objectLiteralBody: string): Set<string> {
  const fields = new Set<string>();
  const fieldLineRe = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)\??\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = fieldLineRe.exec(objectLiteralBody))) {
    fields.add(m[1]);
  }
  return fields;
}

/**
 * Parses a `supabase gen types typescript` output (the `export type
 * Database = { public: { Tables: { <table>: { Row: {...}, ... } } } }`
 * shape) into `{ tableName -> Set<columnName> }` (Row columns only —
 * Row is what application code reads, so it's the relevant direction for
 * "does the hand type reference a column that doesn't exist").
 */
export function parseGeneratedSchemaColumns(generatedTypesContent: string): Map<string, Set<string>> {
  const publicBlock = findBalancedKeyBlock(generatedTypesContent, "public");
  if (!publicBlock) {
    throw new Error(
      '[schema-drift-gate] generated types file has no "public: { ... }" block — is this a real `supabase gen types typescript` snapshot?'
    );
  }
  const tablesBlock = findBalancedKeyBlock(publicBlock.body, "Tables");
  if (!tablesBlock) {
    throw new Error(
      '[schema-drift-gate] generated types file has no "public.Tables" block.'
    );
  }
  const tableBlocks = splitTopLevelTableBlocks(tablesBlock.body);

  const result = new Map<string, Set<string>>();
  for (const [tableName, tableBody] of Array.from(tableBlocks)) {
    const rowBlock = findBalancedKeyBlock(tableBody, "Row");
    if (!rowBlock) continue; // views etc. may lack Row in some CLI versions — skip, not an error
    result.set(tableName, extractFieldNames(rowBlock.body));
  }
  return result;
}

// ─── Hand-written type file parsing ───

/**
 * Parses a hand-written `export type Name = { ... };` style file (the
 * "Supabase codegen の代替" pattern used by templates before this gate
 * existed) into `{ TypeName -> Set<columnName> }`.
 */
export function parseHandWrittenTypeColumns(handTypesContent: string): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const declRe = /export\s+type\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(handTypesContent))) {
    const typeName = m[1];
    const openBraceIndex = m.index + m[0].length - 1;
    let depth = 0;
    let endIndex = -1;
    for (let i = openBraceIndex; i < handTypesContent.length; i++) {
      if (handTypesContent[i] === "{") depth++;
      else if (handTypesContent[i] === "}") {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }
    if (endIndex === -1) {
      throw new Error(
        `[schema-drift-gate] unbalanced braces parsing hand type "${typeName}"`
      );
    }
    const body = handTypesContent.slice(openBraceIndex + 1, endIndex);
    result.set(typeName, extractFieldNames(body));
    declRe.lastIndex = endIndex + 1;
  }
  return result;
}

// ─── Diff ───

export type DriftRule =
  | "hand_field_missing_from_schema" // hand type references a column that doesn't exist in real schema — the dangerous, silent-undefined direction
  | "schema_field_missing_from_hand" // real schema has a column the hand type doesn't declare — safe but stale/incomplete
  | "mapped_table_not_in_schema" // schema-drift.config.json maps a hand type to a table that doesn't exist (renamed/dropped table)
  | "mapped_type_not_in_hand_file" // schema-drift.config.json maps a hand type name that isn't actually declared in the hand types file
  | "unmapped_schema_table"; // a real table has no entry in schema-drift.config.json at all (informational — not every table needs a hand-type surface)

export type DriftSeverity = "error" | "warning" | "info";

export interface DriftFinding {
  rule: DriftRule;
  severity: DriftSeverity;
  table?: string;
  handType?: string;
  field?: string;
  message: string;
}

const SEVERITY_BY_RULE: Record<DriftRule, DriftSeverity> = {
  hand_field_missing_from_schema: "error",
  schema_field_missing_from_hand: "warning",
  mapped_table_not_in_schema: "error",
  mapped_type_not_in_hand_file: "error",
  unmapped_schema_table: "info",
};

/**
 * Compares real-schema columns (from a `supabase gen types typescript`
 * snapshot) against hand-written type columns, via an explicit
 * `{ HandTypeName: "table_name" }` mapping.
 */
export function diffSchemaAndHandTypes(
  schemaTables: Map<string, Set<string>>,
  handTypes: Map<string, Set<string>>,
  mapping: Record<string, string>
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const mappedTables = new Set(Object.values(mapping));

  for (const [handTypeName, tableName] of Object.entries(mapping)) {
    const schemaColumns = schemaTables.get(tableName);
    if (!schemaColumns) {
      findings.push({
        rule: "mapped_table_not_in_schema",
        severity: SEVERITY_BY_RULE.mapped_table_not_in_schema,
        table: tableName,
        handType: handTypeName,
        message: `schema-drift.config.json maps "${handTypeName}" -> table "${tableName}", but no such table exists in the generated schema snapshot. Table renamed/dropped in a migration without updating the mapping?`,
      });
      continue;
    }

    const handColumns = handTypes.get(handTypeName);
    if (!handColumns) {
      findings.push({
        rule: "mapped_type_not_in_hand_file",
        severity: SEVERITY_BY_RULE.mapped_type_not_in_hand_file,
        table: tableName,
        handType: handTypeName,
        message: `schema-drift.config.json maps hand type "${handTypeName}", but "export type ${handTypeName} = { ... }" was not found in the hand types file. Renamed the interface without updating the mapping?`,
      });
      continue;
    }

    for (const field of Array.from(handColumns)) {
      if (!schemaColumns.has(field)) {
        findings.push({
          rule: "hand_field_missing_from_schema",
          severity: SEVERITY_BY_RULE.hand_field_missing_from_schema,
          table: tableName,
          handType: handTypeName,
          field,
          message: `${handTypeName}.${field} does not exist on the real "${tableName}" table. Reading this field returns undefined silently at runtime (see [[daycare_dashboard_type_schema_drift]]) — TypeScript will NOT catch this because the hand type itself declares the field.`,
        });
      }
    }

    for (const field of Array.from(schemaColumns)) {
      if (!handColumns.has(field)) {
        findings.push({
          rule: "schema_field_missing_from_hand",
          severity: SEVERITY_BY_RULE.schema_field_missing_from_hand,
          table: tableName,
          handType: handTypeName,
          field,
          message: `Real "${tableName}"."${field}" column has no counterpart on hand type "${handTypeName}". Not dangerous by itself, but code that needs this field must bypass the type (\`as any\` / raw client) — update the hand type to keep it exhaustive.`,
        });
      }
    }
  }

  for (const tableName of Array.from(schemaTables.keys())) {
    if (!mappedTables.has(tableName)) {
      findings.push({
        rule: "unmapped_schema_table",
        severity: SEVERITY_BY_RULE.unmapped_schema_table,
        table: tableName,
        message: `Table "${tableName}" exists in the generated schema snapshot but has no entry in schema-drift.config.json — either add a hand-type mapping or confirm this table is intentionally accessed without a typed surface.`,
      });
    }
  }

  return findings;
}

export function hasBlockingFindings(findings: DriftFinding[]): boolean {
  return findings.some((f) => f.severity === "error");
}
