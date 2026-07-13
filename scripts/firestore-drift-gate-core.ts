/**
 * Core (side-effect-free) logic for the "Firestore collection/field
 * consistency gate" — the Firestore-family analog of
 * scripts/schema-drift-gate-core.ts (M5 指示書 2026-07-06_039, step 3).
 *
 * saas-builder itself is Supabase-only (no Firestore usage) — this module
 * is a TEMPLATE ASSET for Firestore-based derivatives (the `aria_app_*`
 * family: aria-app, aria-for-salon-app). Those repos are out of scope for
 * this repo to modify directly (aria-app's main source is under a
 * modify-freeze — see `[[feedback_aria_no_source_changes]]`); this script
 * ships here, documented in docs/schema-drift-guide.md, ready to be
 * copied + wired into a Firestore project's own CI without touching
 * saas-builder's dependency graph or aria-app's source.
 *
 * Firestore has no migrations / schema introspection API the way Postgres
 * does — `[[aria_app_collection_drift]]`'s failure mode is a UI/webhook
 * mismatch on COLLECTION NAMES themselves (e.g. `templates` vs
 * `customTemplates` vs `universalTemplates` all half-used across
 * different call sites), not a column-level type mismatch. So instead of
 * parsing a generated schema, this gate works off an EXPLICIT declared
 * schema file (`{ collections: { <name>: string[] (expected fields) } }`)
 * that the project's own team maintains — the source of truth here is a
 * human decision ("these are our real collection names and their
 * expected fields"), not something inferable from Firestore itself.
 *
 * Two checks, both regex/string-based over source file content (kept
 * simple and auditable, same trade-off `scripts/security-gate-core.ts`
 * makes — full AST-based Firestore call-site type-flow analysis is a much
 * larger investment for a "catch the obvious/known-recurring mistake"
 * tool):
 *   1. `db.collection("name")` / `.collection('name')` references to a
 *      collection name NOT in the declared schema — most `aria_app_*`
 *      drift incidents were exactly this: a new call site introducing a
 *      near-miss collection name.
 *   2. Explicitly declared `deprecatedFields` (e.g. a field renamed away
 *      from) still referenced via `.field_name` / `["field_name"]` member
 *      access anywhere in scanned source — the same "known regression,
 *      catch it if it comes back" grep-guard shape used in
 *      day_care_web_app's CI (see `[[daycare_dashboard_type_schema_drift]]`
 *      fix, `dashboard` job's "Schema drift guard" step).
 */

export interface SourceFile {
  path: string;
  content: string;
}

export interface FirestoreSchemaDeclaration {
  /** { collectionName -> expected field names (informational only; not diffed field-by-field — Firestore documents are schemaless by design) } */
  collections: Record<string, string[]>;
  /** Known-bad field names that must never be referenced again, mapped to a human-readable "use X instead" hint. */
  deprecatedFields?: Record<string, string>;
}

export type FirestoreDriftRule = "undeclared_collection_reference" | "deprecated_field_reference";
export type FirestoreDriftSeverity = "error" | "warning";

export interface FirestoreDriftFinding {
  rule: FirestoreDriftRule;
  severity: FirestoreDriftSeverity;
  file: string;
  line: number;
  snippet: string;
  message: string;
}

const COLLECTION_CALL_RE = /\.collection\(\s*["'`]([A-Za-z0-9_-]+)["'`]/g;

/**
 * Flags `.collection("name")` references to a collection name that isn't
 * in `schema.collections`. Deliberately only matches STRING LITERAL
 * arguments (a dynamic `.collection(variableName)` can't be checked this
 * way and is silently skipped, not falsely flagged — see
 * [[auto_scan_output_empty_silent_success]], false positives erode trust
 * in a gate just as much as false negatives).
 */
export function findUndeclaredCollectionReferences(
  files: SourceFile[],
  schema: FirestoreSchemaDeclaration
): FirestoreDriftFinding[] {
  const declared = new Set(Object.keys(schema.collections));
  const findings: FirestoreDriftFinding[] = [];

  for (const file of files) {
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      COLLECTION_CALL_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = COLLECTION_CALL_RE.exec(line))) {
        const name = m[1];
        if (!declared.has(name)) {
          findings.push({
            rule: "undeclared_collection_reference",
            severity: "error",
            file: file.path,
            line: i + 1,
            snippet: line.trim(),
            message: `.collection("${name}") is not declared in the Firestore schema config (collections: ${Array.from(
              declared
            ).join(", ")}). A near-miss collection name (e.g. "templates" vs "customTemplates" vs "universalTemplates" — see [[aria_app_collection_drift]]) silently reads/writes an empty/wrong collection instead of erroring.`,
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Flags references to explicitly-deprecated field names — member access
 * (`.field`) or bracket access (`["field"]` / `['field']`) — anywhere in
 * scanned source. Same grep-guard shape as day_care_web_app's dashboard
 * CI job's "known deprecated column" check.
 */
export function findDeprecatedFieldReferences(
  files: SourceFile[],
  schema: FirestoreSchemaDeclaration
): FirestoreDriftFinding[] {
  const deprecated = schema.deprecatedFields ?? {};
  const findings: FirestoreDriftFinding[] = [];
  if (Object.keys(deprecated).length === 0) return findings;

  for (const file of files) {
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue; // skip comment-only lines
      for (const [field, hint] of Object.entries(deprecated)) {
        const memberRe = new RegExp(`\\.${field}\\b`);
        const bracketRe = new RegExp(`\\[["']${field}["']\\]`);
        if (memberRe.test(line) || bracketRe.test(line)) {
          findings.push({
            rule: "deprecated_field_reference",
            severity: "error",
            file: file.path,
            line: i + 1,
            snippet: line.trim(),
            message: `Reference to deprecated field "${field}". ${hint}`,
          });
        }
      }
    }
  }

  return findings;
}

export function runFirestoreDriftGate(
  files: SourceFile[],
  schema: FirestoreSchemaDeclaration
): FirestoreDriftFinding[] {
  return [
    ...findUndeclaredCollectionReferences(files, schema),
    ...findDeprecatedFieldReferences(files, schema),
  ];
}

export function hasBlockingFindings(findings: FirestoreDriftFinding[]): boolean {
  return findings.some((f) => f.severity === "error");
}
