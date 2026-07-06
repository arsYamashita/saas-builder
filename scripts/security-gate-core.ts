/**
 * Core (side-effect-free) logic for the "derivation security gate"
 * (M5 指示書 2026-07-06_034).
 *
 * This is a grep-style regression guard for security anti-patterns that
 * have already been fixed once in this repo (see docs/security-checklist.md)
 * but could silently be re-introduced by a future PR — either in
 * saas-builder itself or in a project derived from it via
 * `scripts/create-app.ts`. Each rule here maps 1:1 to a checklist item.
 *
 * Kept side-effect-free (pure functions over in-memory `{path, content}`
 * pairs) so scripts/__tests__/security-gate-core.test.ts can assert on
 * fixtures without touching the filesystem or git — the CLI wrapper
 * (scripts/security-gate-check.ts) is the only part that reads files / runs
 * git and is a thin, mostly-untested shell around this module, same split
 * as scripts/kb-resolve-core.ts / scripts/kb-resolve.ts.
 *
 * IMPORTANT (see [[auto_scan_output_empty_silent_success]]): these
 * functions only ever report violations they actually found. "Zero
 * violations" must come from genuinely scanning file content, never from a
 * silently-empty input list — the CLI wrapper is responsible for making
 * sure it actually collected files before calling these, and for treating
 * its own tooling failures (bad git ref, unreadable directory) as a hard
 * error, not as "0 violations".
 */

export interface SourceFile {
  path: string;
  content: string;
}

export interface Violation {
  rule: string;
  file: string;
  line: number;
  snippet: string;
  message: string;
}

/**
 * Blanks out block comments (`/* ... *\/`) while preserving line count (and
 * therefore line numbers), then strips `//` line comments per line.
 *
 * This exists so the checklist's own documentation — e.g. lib/api/errors.ts,
 * which explains the `.catch(() => ({}))` anti-pattern it replaces in a
 * doc comment — does not self-trigger the very regression guard it
 * documents. A naive whole-file exclusion would work too, but stripping
 * comments is a more general fix: it also protects any other file's doc
 * comments from the same false positive, not just this one hardcoded path.
 */
export function stripComments(content: string): string {
  const noBlockComments = content.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, " ")
  );
  return noBlockComments
    .split("\n")
    .map((line) => line.replace(/(?<!:)\/\/.*$/, ""))
    .join("\n");
}

/**
 * True if `content`'s first non-empty line is a `"use client"` /
 * `'use client'` directive.
 *
 * Client Components run in the browser, never touch service-role
 * credentials or Stripe secrets, and their `fetch(...).then(r =>
 * r.json()).catch(() => ({}))` pattern (parsing an HTTP response the
 * component already made) is a different, out-of-scope pattern from the
 * KB'd anti-pattern this gate guards against — [[request_json_parse_silent_fallback]]
 * and [[api_error_message_internal_leak]] are both specifically about a
 * Route Handler silently mangling/leaking on the SERVER side. Excluding
 * Client Components keeps the gate from false-positiving on legitimate
 * client-side fetch handling while still covering every server code path
 * (Route Handlers, lib/, packages/).
 */
export function isClientComponent(content: string): boolean {
  const firstLine = content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return false;
  return /^["']use client["'];?$/.test(firstLine);
}

const SILENT_CATCH_EMPTY_OBJECT = /\.catch\(\s*\(\)\s*=>\s*\(\{\}\)\s*\)/;
const SILENT_CATCH_EMPTY_BLOCK = /\.catch\(\s*\(\)\s*=>\s*\{\}\s*\)/;
const ERROR_DETAIL_MESSAGE_LEAK = /details:\s*[A-Za-z0-9_.$\[\]]*\.message\b/;

/**
 * Checklist items "parseJsonBody" + "エラー漏洩" (docs/security-checklist.md
 * #5 / #6). Flags:
 *   - `.catch(() => ({}))` / `.catch(() => {})` — the silent-fallback
 *     pattern `parseJsonBody()` (lib/api/errors.ts) replaces. See
 *     [[request_json_parse_silent_fallback]].
 *   - `details: <expr>.message` — forwarding a raw exception message to the
 *     client instead of `serverErrorResponse()`'s opaque
 *     `{ error, errorId }` shape. See [[api_error_message_internal_leak]].
 *
 * Client Components are skipped (see isClientComponent) — this check only
 * applies to server-side code (Route Handlers, lib/, packages/).
 */
export function findSilentErrorPatternViolations(
  files: SourceFile[]
): Violation[] {
  const violations: Violation[] = [];

  for (const file of files) {
    if (isClientComponent(file.content)) continue;

    const scannable = stripComments(file.content);
    const lines = scannable.split("\n");

    lines.forEach((line, idx) => {
      if (SILENT_CATCH_EMPTY_OBJECT.test(line)) {
        violations.push({
          rule: "no-silent-catch",
          file: file.path,
          line: idx + 1,
          snippet: line.trim(),
          message:
            "`.catch(() => ({}))` silently swallows a parse/request failure — use parseJsonBody() from @/lib/api/errors instead. See [[request_json_parse_silent_fallback]].",
        });
      } else if (SILENT_CATCH_EMPTY_BLOCK.test(line)) {
        violations.push({
          rule: "no-silent-catch",
          file: file.path,
          line: idx + 1,
          snippet: line.trim(),
          message:
            "`.catch(() => {})` silently swallows an error with no logging — at minimum log the cause server-side. See [[request_json_parse_silent_fallback]].",
        });
      }

      if (ERROR_DETAIL_MESSAGE_LEAK.test(line)) {
        violations.push({
          rule: "no-error-detail-leak",
          file: file.path,
          line: idx + 1,
          snippet: line.trim(),
          message:
            "Forwarding `<expr>.message` in a `details` field leaks internal error detail to the client — use serverErrorResponse() from @/lib/api/errors instead. See [[api_error_message_internal_leak]].",
        });
      }
    });
  }

  return violations;
}

const STRIPE_CHECKOUT_DIRECT = /stripe\.checkout\.sessions\.create\s*\(/;
const STRIPE_WEBHOOK_DIRECT = /stripe\.webhooks\.constructEvent\s*\(/;
const PAYMENTS_PACKAGE_PREFIX = /^packages\/payments\//;

/**
 * Checklist item "Stripe署名/直呼び禁止" (docs/security-checklist.md #3) —
 * makes PR #33's `@saas/payments`-only rule (packages/payments/README.md,
 * "Mandatory usage rules") a permanent CI gate instead of a
 * review-time-only convention.
 *
 * Direct `stripe.checkout.sessions.create()` / `stripe.webhooks
 * .constructEvent()` calls outside `packages/payments/` bypass the
 * required idempotency key / signature verification wrappers. See
 * [[stripe_checkout_idempotency_key_missing]] and
 * [[stripe_webhook_signature_missing]].
 */
export function findStripeDirectCallViolations(
  files: SourceFile[]
): Violation[] {
  const violations: Violation[] = [];

  for (const file of files) {
    if (PAYMENTS_PACKAGE_PREFIX.test(file.path)) continue;
    if (isClientComponent(file.content)) continue;

    const scannable = stripComments(file.content);
    const lines = scannable.split("\n");

    lines.forEach((line, idx) => {
      if (STRIPE_CHECKOUT_DIRECT.test(line)) {
        violations.push({
          rule: "no-stripe-bypass",
          file: file.path,
          line: idx + 1,
          snippet: line.trim(),
          message:
            "Direct stripe.checkout.sessions.create() call outside packages/payments/ — use createCheckoutSession() from @saas/payments (required idempotency key). See [[stripe_checkout_idempotency_key_missing]].",
        });
      }
      if (STRIPE_WEBHOOK_DIRECT.test(line)) {
        violations.push({
          rule: "no-stripe-bypass",
          file: file.path,
          line: idx + 1,
          snippet: line.trim(),
          message:
            "Direct stripe.webhooks.constructEvent() call outside packages/payments/ — use verifyWebhookSignature() from @saas/payments (no unverified-signature escape hatch). See [[stripe_webhook_signature_missing]].",
        });
      }
    });
  }

  return violations;
}

const CREATE_VIEW_RE = /\bCREATE\s+(OR\s+REPLACE\s+)?VIEW\b/i;
const SECURITY_INVOKER_RE = /security_invoker\s*=\s*true/i;

/**
 * Checklist item "security_invoker" (docs/security-checklist.md #2).
 *
 * A Postgres/Supabase VIEW runs with the CREATOR's privileges unless
 * `security_invoker = true` is set, which means it silently bypasses the
 * base table's RLS policies for whoever queries it — see
 * [[supabase_view_rls_bypass_security_invoker]] (reproduced and fixed in
 * energy_scheduler, 2026-07-06). saas-builder's own migrations don't
 * define any views yet, so this is a preventive gate: it only inspects
 * `files` the caller has already identified as NEW migration files (see
 * scripts/security-gate-check.ts's git-diff-based selection) so an
 * existing, already-reviewed view definition is never re-flagged on every
 * subsequent PR.
 */
export function findMigrationViewViolations(files: SourceFile[]): Violation[] {
  const violations: Violation[] = [];

  for (const file of files) {
    if (!CREATE_VIEW_RE.test(file.content)) continue;
    if (SECURITY_INVOKER_RE.test(file.content)) continue;

    const lines = file.content.split("\n");
    const lineIdx = lines.findIndex((l) => CREATE_VIEW_RE.test(l));

    violations.push({
      rule: "no-view-without-security-invoker",
      file: file.path,
      line: lineIdx === -1 ? 1 : lineIdx + 1,
      snippet: (lineIdx === -1 ? lines[0] : lines[lineIdx]).trim(),
      message:
        "New migration creates a VIEW without `security_invoker = true` — it will bypass the base table's RLS for every caller. Add `ALTER VIEW ... SET (security_invoker = true);` (or CREATE VIEW ... WITH (security_invoker = true) on PG15+). See [[supabase_view_rls_bypass_security_invoker]].",
    });
  }

  return violations;
}

/** Runs every source-file rule (everything except the migration/view rule). */
export function scanSourceFiles(files: SourceFile[]): Violation[] {
  return [
    ...findSilentErrorPatternViolations(files),
    ...findStripeDirectCallViolations(files),
  ];
}
