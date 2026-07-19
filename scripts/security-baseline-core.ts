/**
 * Core (side-effect-free) logic for the "template security baseline" gate
 * (M5 指示書114, 2026-07-18 — see
 * `~/Documents/my-vault/30_Knowledge/errors/saas_builder_security_debt_inheritance.md`).
 *
 * Complements scripts/security-gate-core.ts (指示書034's REGRESSION gate,
 * which only re-checks NEW diffs for a handful of already-fixed
 * anti-patterns) with FOUR POSITIVE BASELINE checks, re-verified on every
 * run against the WHOLE tree — not just new migrations/files — so a
 * template regression (someone deletes the signature check, adds a table
 * with no RLS migration, ships a new AI endpoint with no rate limit, or
 * adds a Storage bucket with no policy) is caught even if it wasn't
 * introduced in the current PR's diff:
 *
 *   1. Every file that looks like a Stripe webhook handler actually
 *      INVOKES `stripe.webhooks.constructEvent()` — traced through the
 *      real call chain (which local/imported symbol is actually CALLED
 *      from the entry point), not just "does this text appear somewhere
 *      in the file".
 *   2. Every table any migration CREATEs has RLS enabled AND at least one
 *      non-permissive policy somewhere in the migration history (or an
 *      inline `-- rls-exempt: <reason>` annotation).
 *   3. Every AI/LLM-calling API route is wired to a rate limiter, and
 *      lib/rate-limit.ts defines an AI-scoped bucket (not just reused
 *      login/signup limiters).
 *   4. Every Supabase Storage bucket declared in a migration has an
 *      explicit `public` flag and a scoped `storage.objects` policy —
 *      table-level RLS does not cover Storage; it has its own.
 *
 * This matters specifically because saas-builder is a TEMPLATE — see
 * SECURITY_CHECKLIST.md and [[saas_builder_security_debt_inheritance]]:
 * a gap here silently propagates into every project derived via
 * `scripts/create-app.ts` or a manual copy.
 *
 * Kept side-effect-free (pure functions over in-memory `{path, content}`
 * pairs / plain strings — including check 1's cross-file call-chain
 * tracing, which resolves imports against an in-memory `Map` built from
 * the SAME `SourceFile[]` input rather than touching the filesystem), same
 * split as security-gate-core.ts / security-gate-check.ts, so
 * scripts/__tests__/security-baseline-core.test.ts can assert on fixtures
 * without touching the filesystem or git.
 *
 * IMPORTANT (see [[auto_scan_output_empty_silent_success]]): these
 * functions only ever report violations they actually found by scanning
 * real content. The CLI wrapper (scripts/security-baseline-check.ts) is
 * responsible for making sure it actually collected files before calling
 * these, and for treating its own tooling failures as a hard error, never
 * as "0 violations".
 *
 * Provenance (M5 指示書114 integration, 2026-07-20): this module merges
 * TWO independently-staged partial implementations of 指示書114 rather
 * than picking one —
 *   - checks 2 (RLS+policy) and 4 (storage bucket policy), and check 1's
 *     call-chain-following upgrade, are PORTED from a sibling worktree's
 *     scripts/security-gate/check-*.ts (3 rounds of Codex review already
 *     baked into their regex/parsing logic — see each section's comments
 *     below for the specific false negatives those rounds fixed), adapted
 *     from filesystem I/O to pure in-memory functions to fit this module's
 *     existing side-effect-free architecture;
 *   - check 3 (AI rate-limit wiring) is kept from THIS module's own prior
 *     implementation as-is — a sibling worktree's equivalent check
 *     (check-ratelimit-routes.ts) was deliberately NOT ported: it always
 *     exits 0 (advisory-only, never fails the build) and matches on the
 *     broad `@/lib/providers/*` prefix, which false-positives on
 *     app/api/scoreboard/route.ts and app/api/provider-scoreboard/route.ts
 *     (pure DB-aggregation, no LLM call) while still being the ONLY thing
 *     that would have caught the real gap (app/api/documents/diff/route.ts
 *     calling `fetch("https://api.anthropic.com/v1/messages")` directly,
 *     which imports no `@/lib/providers/*` module at all). THIS module's
 *     findAiRateLimitViolations() below already covers that exact route
 *     via AI_WRAPPER_IMPORT_RE / AI_SDK_CONTENT_RE and fails the build
 *     (not advisory) when rate-limit wiring is missing.
 */
import {
  stripComments,
  stripSqlComments,
  isClientComponent,
  type SourceFile,
  type Violation,
} from "./security-gate-core";

export type { SourceFile, Violation };

/** 1-indexed line number of `index` within `content`. */
function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

// =======================================================================
// 1. Stripe webhook signature verification — call-chain-following
// =======================================================================
//
// Ported from a sibling worktree's scripts/security-gate/check-webhook-signature.ts
// (指示書114 integration, 2026-07-20), adapted from filesystem reads +
// fs.existsSync-based import resolution to pure in-memory lookups against a
// `Map<path, content>` built from this function's own `SourceFile[]` input —
// so it stays side-effect-free and testable via fixtures like every other
// check in this module, with the SAME depth of verification the original
// achieved by actually reading files off disk.
//
// This is a POSITIVE check ("does the handler invoke a constructEvent
// call") — a plain "does `constructEvent(` / `constructStripeEvent(` /
// `verifyWebhookSignature(` appear anywhere in the file" grep (this
// module's prior implementation) already correctly PASSES this repo's real
// app/api/stripe/webhook/route.ts (it calls the wrapper by name), but
// cannot distinguish that from a route that IMPORTS the wrapper and never
// calls it, or that calls an unrelated same-named-module export, or that
// has a dead helper elsewhere in the file which happens to contain the
// literal text — three real false negatives found across three rounds of
// Codex review on the ported version (summarized inline below at each
// fix point). A gate that occasionally false-fails an edge-case-shaped
// safe handler is an acceptable cost; one that false-passes an unverified
// webhook handler is not.

export const STRIPE_WEBHOOK_ROUTE_PATH = "app/api/stripe/webhook/route.ts";

const STRIPE_SIGNATURE_HEADER_RE = /stripe-signature/i;
const STRIPE_WEBHOOKS_NS_RE = /stripe\.webhooks\b/;
const CONSTRUCT_EVENT_RE =
  /\b(?:stripe\.webhooks\.constructEvent|constructEvent|constructStripeEvent)\s*\(/;

function isTestFileName(fileName: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(fileName);
}

/** Repo-relative posix dirname (no filesystem access — pure string op). */
function dirnamePosix(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? "" : p.slice(0, idx);
}

/** Repo-relative posix path join + `.`/`..` normalization (no filesystem access). */
function joinPosix(...parts: string[]): string {
  const segments = parts.filter((p) => p.length > 0).join("/").split("/");
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else out.push(seg);
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}

/**
 * Best-effort resolution of an import specifier to a repo-relative posix
 * path that exists in `fileSet`, or `null` if it's an external npm
 * package (nothing to follow) or doesn't resolve to any collected file.
 *
 * Handles the three specifier shapes this repo actually uses (mirrors
 * tsconfig.json `paths` + this repo's workspace package convention — see
 * packages/payments/package.json's `"main": "./src/index.ts"`):
 *   - `@/...`       -> repo root
 *   - `@saas/<pkg>` -> `packages/<pkg>/src/index` (or `.../src/<sub>`)
 *   - `./x`, `../x` -> relative to the importing file's directory
 *
 * Does NOT read tsconfig.json / package.json at runtime to derive these
 * mappings generically — hardcoded to this repo's two conventions, same
 * scope note as the original. If resolution fails, this returns `null`,
 * which surfaces as `handlerInvokesConstructEvent` failing closed (FAIL,
 * not a silent pass) — a loud failure mode, not a silent mis-resolve.
 */
function resolveImportPure(
  spec: string,
  fromDir: string,
  fileSet: Set<string>
): string | null {
  let base: string;

  if (spec.startsWith("@/")) {
    base = spec.slice(2);
  } else if (spec.startsWith("@saas/")) {
    const rest = spec.slice("@saas/".length);
    const [pkg, ...subParts] = rest.split("/");
    base =
      subParts.length === 0
        ? joinPosix("packages", pkg, "src", "index")
        : joinPosix("packages", pkg, "src", ...subParts);
  } else if (spec.startsWith(".")) {
    base = joinPosix(fromDir, spec);
  } else {
    return null;
  }

  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  for (const candidate of candidates) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

// ── Lightweight import/export/call parsing (not a real parser — regex- ──
// based, same tradeoff as resolveImportPure's scope note above). Precise
// enough for this repo's actual module shapes (small, single-purpose
// files; named + namespace imports; barrel re-exports), and fails CLOSED
// (reports FAIL, not a silent pass) when it can't prove an invocation.

interface NamedBinding {
  localName: string;
  importedName: string;
  spec: string;
}
interface NamespaceBinding {
  localName: string;
  spec: string;
}
interface WildcardReExport {
  spec: string;
}

const NAMED_CLAUSE_RE =
  /\b(import|export)\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g;
const NAMESPACE_IMPORT_RE =
  /\bimport\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/g;
const WILDCARD_REEXPORT_RE = /\bexport\s+\*\s+from\s+["']([^"']+)["']/g;
const CALL_RE = /\b([A-Za-z_$][\w$]*)\s*\(/g;
const NAMESPACE_CALL_RE = /\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;

function parseClauseItems(body: string): { imported: string; local: string }[] {
  return body
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((item) => {
      const m = item.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (m) return { imported: m[1], local: m[2] };
      return { imported: item, local: item };
    });
}

function parseNamedImports(content: string): NamedBinding[] {
  const bindings: NamedBinding[] = [];
  for (const m of Array.from(content.matchAll(NAMED_CLAUSE_RE))) {
    if (m[1] !== "import") continue;
    const spec = m[3];
    for (const item of parseClauseItems(m[2])) {
      bindings.push({ localName: item.local, importedName: item.imported, spec });
    }
  }
  return bindings;
}

function parseNamedReExports(content: string): NamedBinding[] {
  const bindings: NamedBinding[] = [];
  for (const m of Array.from(content.matchAll(NAMED_CLAUSE_RE))) {
    if (m[1] !== "export") continue;
    const spec = m[3];
    for (const item of parseClauseItems(m[2])) {
      bindings.push({ localName: item.local, importedName: item.imported, spec });
    }
  }
  return bindings;
}

function parseNamespaceImports(content: string): NamespaceBinding[] {
  return Array.from(content.matchAll(NAMESPACE_IMPORT_RE)).map((m) => ({
    localName: m[1],
    spec: m[2],
  }));
}

function parseWildcardReExports(content: string): WildcardReExport[] {
  return Array.from(content.matchAll(WILDCARD_REEXPORT_RE)).map((m) => ({ spec: m[1] }));
}

function extractCalledNames(content: string): Set<string> {
  const result = new Set<string>();
  for (const m of Array.from(content.matchAll(CALL_RE))) result.add(m[1]);
  return result;
}

function extractNamespaceCalledMembers(content: string): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const m of Array.from(content.matchAll(NAMESPACE_CALL_RE))) {
    const [, obj, member] = m;
    if (!result.has(obj)) result.set(obj, new Set());
    result.get(obj)!.add(member);
  }
  return result;
}

/**
 * From `openBraceIdx`, returns the text through its matching `}`
 * (inclusive) via simple depth counting. Does not understand
 * strings/template literals/comments that might contain unbalanced
 * braces — a known "not a real parser" limitation whose failure mode
 * only ever makes the subsequent check MORE conservative (fail closed),
 * never less.
 */
function extractBalancedBraceBody(content: string, openBraceIdx: number): string {
  let depth = 0;
  let i = openBraceIdx;
  for (; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return content.slice(openBraceIdx, i);
}

/**
 * Best-effort isolation of `name`'s own LOCAL declaration body within
 * `content`. Returns `null` if `name` isn't declared locally in this file
 * (only re-exported here, handled separately via parseNamedReExports).
 */
function extractDeclarationSource(content: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const funcRe = new RegExp(
    `\\b(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+${escaped}\\b`
  );
  const funcMatch = funcRe.exec(content);
  if (funcMatch) {
    const braceIdx = content.indexOf("{", funcMatch.index);
    if (braceIdx !== -1) return extractBalancedBraceBody(content, braceIdx);
  }

  const constRe = new RegExp(`\\b(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\b[^=]*=`);
  const constMatch = constRe.exec(content);
  if (constMatch) {
    const afterEq = constMatch.index + constMatch[0].length;
    const braceIdx = content.indexOf("{", afterEq);
    const semicolonIdx = content.indexOf(";", afterEq);
    if (braceIdx !== -1 && (semicolonIdx === -1 || braceIdx < semicolonIdx)) {
      return extractBalancedBraceBody(content, braceIdx);
    }
    const end = semicolonIdx === -1 ? content.length : semicolonIdx + 1;
    return content.slice(afterEq, end);
  }

  return null;
}

const MAX_IMPORT_DEPTH = 4;

/**
 * Follows import edges found in `fullContent`, crediting a call as made
 * only if the imported local name (or a namespace member) actually
 * appears as a call expression WITHIN `scopeBody` (the isolated body of
 * the specific symbol being traced — never "anything called anywhere in
 * the file").
 */
function chaseImportedCallsFrom(
  fullContent: string,
  scopeBody: string,
  fromDir: string,
  depth: number,
  visited: Set<string>,
  fileMap: Map<string, string>,
  fileSet: Set<string>
): boolean {
  const calledNames = extractCalledNames(scopeBody);
  for (const imp of parseNamedImports(fullContent)) {
    if (!calledNames.has(imp.localName)) continue;
    const resolved = resolveImportPure(imp.spec, fromDir, fileSet);
    if (
      resolved &&
      invokesConstructEvent(resolved, imp.importedName, depth + 1, visited, fileMap, fileSet)
    ) {
      return true;
    }
  }

  const namespaceCalledMembers = extractNamespaceCalledMembers(scopeBody);
  for (const ns of parseNamespaceImports(fullContent)) {
    const members = namespaceCalledMembers.get(ns.localName);
    if (!members) continue;
    const resolved = resolveImportPure(ns.spec, fromDir, fileSet);
    if (!resolved) continue;
    for (const member of Array.from(members)) {
      if (invokesConstructEvent(resolved, member, depth + 1, visited, fileMap, fileSet)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Does invoking symbol `targetName` in the file at `filePath` reach a
 * constructEvent-shaped call? Three steps, in order (Codex review round-2
 * fix — everything below is scoped to `targetName` specifically, never
 * "this file, whole-file"):
 *   1. Re-export edges matching `targetName` — followed unconditionally
 *      (forwarding a binding isn't a call).
 *   2. A LOCAL declaration of `targetName` — isolate its own body and
 *      test/chase ONLY that slice.
 *   3. Neither found: this file proves nothing for `targetName` — fail
 *      closed (return false), never fall back to a whole-file scan.
 */
function invokesConstructEvent(
  filePath: string,
  targetName: string,
  depth: number,
  visited: Set<string>,
  fileMap: Map<string, string>,
  fileSet: Set<string>
): boolean {
  const key = `${filePath}::${targetName}`;
  if (visited.has(key)) return false;
  visited.add(key);
  if (depth > MAX_IMPORT_DEPTH) return false;

  const content = fileMap.get(filePath);
  if (content === undefined) return false;

  const fromDir = dirnamePosix(filePath);

  for (const reExport of parseNamedReExports(content)) {
    if (reExport.localName !== targetName) continue;
    const resolved = resolveImportPure(reExport.spec, fromDir, fileSet);
    if (
      resolved &&
      invokesConstructEvent(resolved, reExport.importedName, depth + 1, visited, fileMap, fileSet)
    ) {
      return true;
    }
  }
  for (const wildcard of parseWildcardReExports(content)) {
    const resolved = resolveImportPure(wildcard.spec, fromDir, fileSet);
    if (resolved && invokesConstructEvent(resolved, targetName, depth + 1, visited, fileMap, fileSet)) {
      return true;
    }
  }

  const body = extractDeclarationSource(content, targetName);
  if (body === null) return false;
  if (CONSTRUCT_EVENT_RE.test(body)) return true;
  return chaseImportedCallsFrom(content, body, fromDir, depth, visited, fileMap, fileSet);
}

// ── Handler entry-point isolation (Codex review round-3 P1-b) ──────────
//
// The entry point's own body must be isolated and traced — a whole-file
// `CONSTRUCT_EVENT_RE.test(content)` shortcut would false-pass a handler
// that reads stripe-signature and never verifies anything, as long as a
// dead/unused helper elsewhere in the SAME file happened to contain the
// literal text.

const ROUTE_FILE_RE = /(^|\/)route\.tsx?$/;
const HTTP_METHOD_NAMES = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function findRouteHandlerBodies(content: string): string[] {
  const bodies: string[] = [];
  for (const method of HTTP_METHOD_NAMES) {
    const re = new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s+${method}\\b`);
    const m = re.exec(content);
    if (!m) continue;
    const braceIdx = content.indexOf("{", m.index + m[0].length);
    if (braceIdx === -1) continue;
    bodies.push(extractBalancedBraceBody(content, braceIdx));
  }
  return bodies;
}

const EXPORTED_FUNCTION_DECL_RE =
  /\bexport\s+(?:default\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
const EXPORTED_CONST_ARROW_RE =
  /\bexport\s+(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>\s*\{/g;

function findExportedFunctionBodies(content: string): string[] {
  const bodies: string[] = [];
  for (const m of Array.from(content.matchAll(EXPORTED_FUNCTION_DECL_RE))) {
    const braceIdx = content.indexOf("{", m.index! + m[0].length);
    if (braceIdx === -1) continue;
    bodies.push(extractBalancedBraceBody(content, braceIdx));
  }
  for (const m of Array.from(content.matchAll(EXPORTED_CONST_ARROW_RE))) {
    const braceIdx = m.index! + m[0].length - 1;
    bodies.push(extractBalancedBraceBody(content, braceIdx));
  }
  return bodies;
}

function findCandidateEntryBodies(filePath: string, content: string): string[] {
  const allBodies = ROUTE_FILE_RE.test(filePath)
    ? findRouteHandlerBodies(content)
    : findExportedFunctionBodies(content);
  return allBodies.filter(
    (body) => STRIPE_SIGNATURE_HEADER_RE.test(body) || STRIPE_WEBHOOKS_NS_RE.test(body)
  );
}

/**
 * Top-level entry point for a webhook-handler candidate file. Returns
 * false (fail closed) if no entry-point body referencing
 * stripe-signature/stripe.webhooks can be identified at all.
 */
function handlerInvokesConstructEvent(
  filePath: string,
  fileMap: Map<string, string>,
  fileSet: Set<string>
): boolean {
  const content = fileMap.get(filePath);
  if (content === undefined) return false;

  const entryBodies = findCandidateEntryBodies(filePath, content);
  if (entryBodies.length === 0) return false;

  const fromDir = dirnamePosix(filePath);
  for (const body of entryBodies) {
    if (CONSTRUCT_EVENT_RE.test(body)) return true;
    if (chaseImportedCallsFrom(content, body, fromDir, 0, new Set<string>(), fileMap, fileSet)) {
      return true;
    }
  }
  return false;
}

/**
 * Checklist item 1. `files` should be every non-test `.ts`/`.tsx` file
 * under app/, lib/, packages/ (the CLI wrapper's job — see
 * scripts/security-baseline-check.ts) so the call chain can actually be
 * followed across module boundaries (route -> @/lib/payments ->
 * @saas/payments -> packages/payments/src/webhook.ts, this repo's real
 * shape).
 *
 * If NO file anywhere references `stripe-signature` / `stripe.webhooks`,
 * that's reported as a violation against the canonical
 * STRIPE_WEBHOOK_ROUTE_PATH — unlike the original ported check (which
 * treats "no candidate" as a legitimate "nothing to verify" pass for a
 * project that might not have Stripe at all), THIS repo already has
 * Stripe billing wired up (subscriptions, checkout, referrals — see
 * app/api/stripe/webhook/route.ts on main), so a total absence of any
 * webhook-shaped file is itself the regression this gate exists to catch
 * (e.g. the whole route was deleted). A derived project with no Stripe
 * integration at all should delete/adjust this expectation deliberately,
 * not have it silently satisfied by absence.
 */
export function findWebhookSignatureViolations(files: SourceFile[]): Violation[] {
  const fileMap = new Map(files.map((f) => [f.path, f.content] as const));
  const fileSet = new Set(fileMap.keys());

  const candidates = files.filter(
    (f) => STRIPE_SIGNATURE_HEADER_RE.test(f.content) || STRIPE_WEBHOOKS_NS_RE.test(f.content)
  );

  if (candidates.length === 0) {
    return [
      {
        rule: "webhook-signature-missing",
        file: STRIPE_WEBHOOK_ROUTE_PATH,
        line: 0,
        snippet: "",
        message:
          `No file references the \`stripe-signature\` header or the \`stripe.webhooks\` namespace anywhere in the scanned ` +
          `tree (app/, lib/, packages/) — expected ${STRIPE_WEBHOOK_ROUTE_PATH} to verify Stripe webhook payloads before ` +
          `trusting them. See [[stripe_webhook_signature_missing]].`,
      },
    ];
  }

  const violations: Violation[] = [];
  for (const file of candidates) {
    if (handlerInvokesConstructEvent(file.path, fileMap, fileSet)) continue;
    violations.push({
      rule: "webhook-signature-missing",
      file: file.path,
      line: 1,
      snippet: "",
      message:
        `${file.path} looks like a Stripe webhook handler (references stripe-signature / stripe.webhooks) but no ` +
        `request-handling entry-point function (exported GET/POST/etc. for a route.ts, or an exported function for a ` +
        `library file) was proven to invoke stripe.webhooks.constructEvent() (checked up to ${MAX_IMPORT_DEPTH} hops, ` +
        `following @/, @saas/, and relative imports/re-exports only — merely CONTAINING the text constructEvent ` +
        `anywhere in the file, e.g. in a dead/unused helper never called from the entry point, does not count; fails ` +
        `closed if invocation can't be proven). See [[stripe_webhook_signature_missing]].`,
    });
  }
  return violations;
}

// =======================================================================
// 2. RLS coverage + non-permissive policy, across ALL migrations
// =======================================================================
//
// Ported from a sibling worktree's scripts/security-gate/check-rls-migrations.ts
// (指示書114 integration, 2026-07-20) — strictly stronger than this
// module's prior "RLS enabled somewhere" check: also requires at least one
// CREATE POLICY targeting the table whose predicate is not unconditional
// (`USING (true)` / `1=1` / empty), and supports an inline
// `-- rls-exempt: <reason>` annotation. Already fixed across three rounds
// of Codex review — see each fix point's comment below.

export interface RlsAllowlistEntry {
  table: string;
  reason: string;
}

/**
 * Legacy array-based exemption mechanism, kept for backward compatibility
 * (a caller can still pass an explicit allowlist to
 * findRlsCoverageViolations). The RECOMMENDED mechanism as of the
 * 2026-07-20 integration is the inline `-- rls-exempt: <reason>` comment
 * (see RLS_EXEMPT_RE below) — co-located with the table definition itself,
 * so the exemption can't drift out of sync with which migration file
 * actually created the table. Empty today; every table this repo's
 * migrations create as of 2026-07-20 either has RLS+policy or carries an
 * inline exemption (supabase/migrations/0015_commissions_idempotency.sql's
 * `commissions_duplicates_backup`, a deliberately zero-policy
 * service-role-only audit table).
 */
export const RLS_ALLOWLIST: RlsAllowlistEntry[] = [];

// ── Qualified-identifier parsing (Codex review round-3 P2-c) ───────────
//
// Regex alone can't cleanly express "schema and/or table each optionally
// double-quoted" without either missing cases or becoming unreadable, so
// this is a small hand-written forward scanner: read one identifier
// segment (quoted or bare), and if a `.` follows, read a second segment.

const DEFAULT_SCHEMA = "public";

interface QualifiedIdent {
  schemaRaw: string | null;
  nameRaw: string;
  endIndex: number;
}

function parseIdentSegment(text: string, index: number): { raw: string; endIndex: number } | null {
  if (text[index] === '"') {
    const end = text.indexOf('"', index + 1);
    if (end === -1) return null;
    return { raw: text.slice(index + 1, end), endIndex: end + 1 };
  }
  const m = /^[A-Za-z_][\w]*/.exec(text.slice(index));
  if (!m) return null;
  return { raw: m[0], endIndex: index + m[0].length };
}

function parseQualifiedIdent(text: string, index: number): QualifiedIdent | null {
  let i = index;
  while (i < text.length && /\s/.test(text[i])) i++;
  const first = parseIdentSegment(text, i);
  if (!first) return null;
  if (text[first.endIndex] === ".") {
    const second = parseIdentSegment(text, first.endIndex + 1);
    if (second) {
      return { schemaRaw: first.raw, nameRaw: second.raw, endIndex: second.endIndex };
    }
  }
  return { schemaRaw: null, nameRaw: first.raw, endIndex: first.endIndex };
}

/** Canonical `schema.table` key (lowercased; unqualified defaults to `public`) — used for every table-identity comparison. Schema is preserved (Codex review P2, prior round): collapsing to the bare table name would let `public.widgets` and `private.widgets` alias. */
function canonicalizeQualified(q: QualifiedIdent): string {
  const schema = (q.schemaRaw ?? DEFAULT_SCHEMA).toLowerCase();
  return `${schema}.${q.nameRaw.toLowerCase()}`;
}

function canonicalizeBareName(name: string): string {
  return `${DEFAULT_SCHEMA}.${name.toLowerCase()}`;
}

/** Normalizes an allowlist entry's `table` field the same way, so "widgets", "public.widgets", and "PUBLIC.Widgets" all match consistently. */
function normalizeAllowlistTable(raw: string): string {
  const parts = raw.split(".").map((p) => p.toLowerCase());
  if (parts.length <= 1) return `${DEFAULT_SCHEMA}.${parts[0] ?? raw.toLowerCase()}`;
  return parts.slice(-2).join(".");
}

// ── Statement scanners ──────────────────────────────────────────────────

const CREATE_TABLE_PREFIX_RE = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?/gi;
const ALTER_TABLE_PREFIX_RE = /\balter\s+table\s+(?:if\s+exists\s+)?/gi;
const ENABLE_RLS_SUFFIX_RE = /^\s+enable\s+row\s+level\s+security\b/i;
const CREATE_POLICY_PREFIX_RE = /\bcreate\s+policy\s+(?:if\s+not\s+exists\s+)?/gi;
const ON_KEYWORD_RE = /^\s+on\s+/i;

interface TableMatch {
  canonical: string;
  index: number;
}

function scanCreateTables(text: string): TableMatch[] {
  const results: TableMatch[] = [];
  for (const m of Array.from(text.matchAll(CREATE_TABLE_PREFIX_RE))) {
    const identStart = m.index! + m[0].length;
    const ident = parseQualifiedIdent(text, identStart);
    if (!ident) continue;
    results.push({ canonical: canonicalizeQualified(ident), index: m.index! });
  }
  return results;
}

function scanAlterEnableRls(text: string): string[] {
  const results: string[] = [];
  for (const m of Array.from(text.matchAll(ALTER_TABLE_PREFIX_RE))) {
    const identStart = m.index! + m[0].length;
    const ident = parseQualifiedIdent(text, identStart);
    if (!ident) continue;
    if (ENABLE_RLS_SUFFIX_RE.test(text.slice(ident.endIndex))) {
      results.push(canonicalizeQualified(ident));
    }
  }
  return results;
}

interface PolicyStatement {
  table: string;
  stmtText: string;
}

function scanCreatePolicies(text: string): PolicyStatement[] {
  const results: PolicyStatement[] = [];
  for (const m of Array.from(text.matchAll(CREATE_POLICY_PREFIX_RE))) {
    const i = m.index! + m[0].length;
    const policyName = parseQualifiedIdent(text, i);
    if (!policyName) continue;
    const onMatch = ON_KEYWORD_RE.exec(text.slice(policyName.endIndex));
    if (!onMatch) continue;
    const tableStart = policyName.endIndex + onMatch[0].length;
    const tableIdent = parseQualifiedIdent(text, tableStart);
    if (!tableIdent) continue;
    const stmtEnd = text.indexOf(";", tableIdent.endIndex);
    const stmtText = text.slice(m.index!, stmtEnd === -1 ? text.length : stmtEnd);
    results.push({ table: canonicalizeQualified(tableIdent), stmtText });
  }
  return results;
}

// ── Permissive-predicate detection (Codex review round-3 P1-a) ─────────

function extractParenExprAfter(text: string, keywordRe: RegExp): string | null {
  const m = keywordRe.exec(text);
  if (!m) return null;
  const afterKeyword = m.index + m[0].length;
  const openIdx = text.indexOf("(", afterKeyword);
  if (openIdx === -1) return null;
  if (!/^\s*$/.test(text.slice(afterKeyword, openIdx))) return null;

  let depth = 0;
  let i = openIdx;
  for (; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return text.slice(openIdx + 1, i - 1);
}

const OBVIOUSLY_PERMISSIVE_RE = /^(?:true|1\s*=\s*1)$/i;
const HAS_REAL_PREDICATE_SIGNAL_RE =
  /auth\.|[a-z_][\w]*\s*(?:=|<>|!=|<=|>=|<|>)|[a-z_][\w]*\s+(?:in|is)\b|\bexists\s*\(|[a-z_][\w]*\s*\(/i;

function isPermissiveExprText(expr: string): boolean {
  const trimmed = expr.trim().replace(/\s+/g, " ");
  if (trimmed === "") return true;
  if (OBVIOUSLY_PERMISSIVE_RE.test(trimmed)) return true;
  return !HAS_REAL_PREDICATE_SIGNAL_RE.test(trimmed);
}

/** A policy statement counts as coverage only if it has ≥1 of USING/WITH CHECK, and every clause it has is non-permissive. */
function policyIsNonPermissive(stmtText: string): boolean {
  const usingExpr = extractParenExprAfter(stmtText, /\busing\s*/i);
  const checkExpr = extractParenExprAfter(stmtText, /\bwith\s+check\s*/i);
  if (usingExpr === null && checkExpr === null) return false;
  if (usingExpr !== null && isPermissiveExprText(usingExpr)) return false;
  if (checkExpr !== null && isPermissiveExprText(checkExpr)) return false;
  return true;
}

// ── Dynamic (%I-parameterized) per-table loop handling (Codex review ───
// round-2 P2: binds strictly to the specific FOREACH loop that
// parameterizes the RLS/policy statement, not "any array in the
// enclosing DO block") ──

const DO_BLOCK_RE = /do\s*\$\$([\s\S]*?)\$\$\s*;/gi;
const FOREACH_LOOP_RE =
  /\bforeach\s+([A-Za-z_][\w]*)\s+in\s+array\s+(array\s*\[[^\]]*\])\s+loop\b([\s\S]*?)\bend\s+loop\b/gi;
const EXEC_FORMAT_CALL_RE = /execute\s+format\s*\(\s*'([^']*)'\s*,\s*([^)]*)\)/gi;
const DYNAMIC_PARAMETERIZED_ENABLE_RLS_RE = /%I\s+enable\s+row\s+level\s+security/i;
const DYNAMIC_PARAMETERIZED_POLICY_RE = /create\s+policy\s+%I\s+on\s+%I\b/i;
const QUOTED_STRING_RE = /'([^']+)'/g;

function splitFormatArgs(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const RLS_EXEMPT_RE = /--\s*rls-exempt:\s*(.+)/i;

/** Every table any migration CREATEs, with the first file/line it appears at (first occurrence wins). */
export function findCreatedTables(files: SourceFile[]): Map<string, { file: string; line: number }> {
  const created = new Map<string, { file: string; line: number }>();
  for (const file of files) {
    const stripped = stripSqlComments(file.content);
    for (const t of scanCreateTables(stripped)) {
      if (created.has(t.canonical)) continue;
      created.set(t.canonical, { file: file.path, line: lineNumberAt(stripped, t.index) });
    }
  }
  return created;
}

/** Every table any migration enables RLS on — direct literal form AND the dynamic %I-loop form (bound strictly to its own FOREACH loop). */
export function findRlsEnabledTables(files: SourceFile[]): Set<string> {
  const enabled = new Set<string>();
  for (const file of files) {
    const stripped = stripSqlComments(file.content);
    for (const canonical of scanAlterEnableRls(stripped)) enabled.add(canonical);

    for (const block of Array.from(stripped.matchAll(DO_BLOCK_RE))) {
      for (const loopMatch of Array.from(block[1].matchAll(FOREACH_LOOP_RE))) {
        const [, loopVar, arrayLiteral, loopBody] = loopMatch;
        const arrayTables = Array.from(arrayLiteral.matchAll(QUOTED_STRING_RE)).map((m) =>
          canonicalizeBareName(m[1])
        );
        if (arrayTables.length === 0) continue;

        let rlsBoundToLoopVar = false;
        for (const execMatch of Array.from(loopBody.matchAll(EXEC_FORMAT_CALL_RE))) {
          const [, formatStr, rawArgs] = execMatch;
          const args = splitFormatArgs(rawArgs);
          if (DYNAMIC_PARAMETERIZED_ENABLE_RLS_RE.test(formatStr) && args[0] === loopVar) {
            rlsBoundToLoopVar = true;
          }
        }
        if (rlsBoundToLoopVar) arrayTables.forEach((t) => enabled.add(t));
      }
    }
  }
  return enabled;
}

/** Every table covered by at least one non-permissive policy — direct CREATE POLICY, or the %I-parameterized loop form. */
export function findPolicyCoveredTables(files: SourceFile[]): Set<string> {
  const covered = new Set<string>();
  for (const file of files) {
    const stripped = stripSqlComments(file.content);
    for (const policy of scanCreatePolicies(stripped)) {
      if (policyIsNonPermissive(policy.stmtText)) covered.add(policy.table);
    }

    for (const block of Array.from(stripped.matchAll(DO_BLOCK_RE))) {
      for (const loopMatch of Array.from(block[1].matchAll(FOREACH_LOOP_RE))) {
        const [, loopVar, arrayLiteral, loopBody] = loopMatch;
        const arrayTables = Array.from(arrayLiteral.matchAll(QUOTED_STRING_RE)).map((m) =>
          canonicalizeBareName(m[1])
        );
        if (arrayTables.length === 0) continue;

        let policyBoundToLoopVar = false;
        for (const execMatch of Array.from(loopBody.matchAll(EXEC_FORMAT_CALL_RE))) {
          const [, formatStr, rawArgs] = execMatch;
          const args = splitFormatArgs(rawArgs);
          if (
            DYNAMIC_PARAMETERIZED_POLICY_RE.test(formatStr) &&
            args[1] === loopVar &&
            policyIsNonPermissive(formatStr)
          ) {
            policyBoundToLoopVar = true;
          }
        }
        if (policyBoundToLoopVar) arrayTables.forEach((t) => covered.add(t));
      }
    }
  }
  return covered;
}

/** Tables carrying an inline `-- rls-exempt: <reason>` comment on the same line as (or the line immediately preceding) their CREATE TABLE statement. */
export function findRlsExemptions(files: SourceFile[]): Map<string, string> {
  const exemptions = new Map<string, string>();
  for (const file of files) {
    const stripped = stripSqlComments(file.content);
    const originalLines = file.content.split("\n");
    for (const t of scanCreateTables(stripped)) {
      const line = lineNumberAt(stripped, t.index);
      const sameLine = originalLines[line - 1] ?? "";
      const prevLine = originalLines[line - 2] ?? "";
      const marker = RLS_EXEMPT_RE.exec(sameLine) ?? RLS_EXEMPT_RE.exec(prevLine);
      if (marker) exemptions.set(t.canonical, marker[1].trim());
    }
  }
  return exemptions;
}

/**
 * Checklist item 2 ("RLS enabled + non-permissive policy on every
 * table"). Stronger than "RLS enabled somewhere": also requires a real
 * CREATE POLICY whose predicate isn't `USING (true)` / `1=1` / empty —
 * enabling RLS with zero policies still denies nothing extra by itself
 * from a grep's perspective, and is a real checklist violation
 * (docs/rules/08-db-rules.md, "Row Level Security (mandatory)").
 *
 * A table is exempt if EITHER it carries an inline `-- rls-exempt:`
 * comment (see findRlsExemptions — the recommended mechanism) OR its
 * canonical name appears in `allowlist` (legacy array-based mechanism,
 * kept for callers that already depend on it).
 */
export function findRlsCoverageViolations(
  files: SourceFile[],
  allowlist: RlsAllowlistEntry[] = RLS_ALLOWLIST
): Violation[] {
  const created = findCreatedTables(files);
  const enabled = findRlsEnabledTables(files);
  const policyCovered = findPolicyCoveredTables(files);
  const exemptions = findRlsExemptions(files);
  const allowlisted = new Set(allowlist.map((e) => normalizeAllowlistTable(e.table)));

  const violations: Violation[] = [];
  for (const [table, loc] of Array.from(created)) {
    const hasRls = enabled.has(table);
    const hasPolicy = policyCovered.has(table);
    if (hasRls && hasPolicy) continue;
    if (exemptions.has(table) || allowlisted.has(table)) continue;

    const reason = !hasRls
      ? "no migration enables row level security for it (no direct ALTER TABLE ... ENABLE ROW LEVEL SECURITY, and no %I-parameterized loop covering it)"
      : "row level security is enabled but no non-permissive CREATE POLICY targets it anywhere in migration history (either no policy at all, or every policy found has an unconditional `USING (true)` / `WITH CHECK (true)` / `1=1` / empty predicate — which grants every authenticated user every row, defeating RLS)";

    violations.push({
      rule: "rls-missing",
      file: loc.file,
      line: loc.line,
      snippet: `create table ${table}`,
      message:
        `Table "${table}" is created in ${loc.file}:${loc.line} but ${reason}. Add RLS + a real (non-permissive) policy ` +
        `(see docs/db/rls-migration-template.sql), or mark the exception with an inline \`-- rls-exempt: <reason>\` comment ` +
        `above/on the CREATE TABLE line, or add "${table}" to RLS_ALLOWLIST in scripts/security-baseline-core.ts with a ` +
        `reason — never silently weaken this regex to make a violation disappear. See [[supabase_rls_missing]].`,
    });
  }
  return violations;
}

// =======================================================================
// 3. AI endpoint rate-limit wiring
// =======================================================================
//
// Kept from this module's prior implementation — see this file's header
// comment "Provenance" note for why the sibling worktree's equivalent
// (advisory-only, always exits 0, broad `@/lib/providers/*` path match
// producing false positives on scoreboard/provider-scoreboard) was NOT
// ported. This implementation already correctly identifies exactly
// app/api/documents/diff/route.ts and
// app/api/projects/[projectId]/split-run-to-files/route.ts as violations
// (2 true positives, 0 false positives — verified empirically before this
// integration) and fails the build (not advisory) until they're fixed —
// see section "AI endpoint rate limiting" in SECURITY_CHECKLIST.md for
// how those two routes were fixed.

/**
 * Path fragments that mark an API route as "calls a paid/metered AI
 * provider" for this gate's purposes — mirrors lib/rate-limit.ts's own
 * comment ("AI generation endpoints (generate-blueprint /
 * generate-implementation / generate-schema / generate-api-design /
 * generate-template / rewrite-brief)"). A derived project adding a new AI
 * endpoint under a path matching one of these gets flagged if it forgets
 * to wire a rate limiter.
 *
 * Path-name matching alone is NOT sufficient (Codex review P1,
 * 2026-07-18): a route named e.g. `app/api/chat/route.ts` or
 * `app/api/summarize/route.ts` that calls an LLM provider would silently
 * bypass this pattern. See AI_SDK_CONTENT_RE / AI_WRAPPER_IMPORT_RE below
 * for the content-based fallback that closes that gap.
 */
const AI_ENDPOINT_PATH_RE =
  /\/(generate[-_][a-z-]+|rewrite-brief|ai-[a-z-]+|llm-[a-z-]+)\//i;

// Direct/embedded LLM provider SDK usage — catches an AI endpoint whose
// PATH gives no hint at all (Codex review P1). Deliberately does not
// include a bare `.chat.completions`-adjacent identifier that could
// appear in unrelated code; each pattern here is specific enough to a
// real LLM SDK call site that a false positive would require another
// library to coincidentally share the exact same shape.
const AI_SDK_CONTENT_RE =
  /\bopenai\b|\banthropic\b|\bgroq-sdk\b|\bGoogleGenerativeAI\b|@ai-sdk\/|@anthropic-ai\/sdk|@google\/generative-ai|generativelanguage\.googleapis|new\s+OpenAI\s*\(|\bgenerateText\s*\(|\bstreamText\s*\(|\.chat\.completions\b|\bmessages\.create\s*\(/i;

// saas-builder routes an LLM call through a provider-abstraction layer
// rather than embedding the SDK call in the route handler itself
// (`executeTask()` in lib/providers/task-router.ts; `compareDocuments()`
// in lib/document-analysis/document-diff.ts) — neither route file
// contains any AI_SDK_CONTENT_RE literal, so a route importing one of
// these specific wrapper entry points is ALSO treated as an AI endpoint.
// Listed explicitly by exact submodule path (not a broad
// "@/lib/providers" prefix): sibling modules under the same directory —
// lib/providers/template-scoreboard.ts, lib/providers/provider-scoreboard.ts
// (imported by app/api/scoreboard/route.ts,
// app/api/provider-scoreboard/route.ts) — are pure DB-aggregation
// reporting with NO LLM call; a broad prefix match would false-positive
// those two GET-only, non-AI endpoints.
const AI_WRAPPER_IMPORT_RE =
  /from\s+["']@\/lib\/providers\/task-router["']|from\s+["']@\/lib\/document-analysis\/document-diff["']/;

// Narrowed to the shared rate-limit module's actual public surface, and —
// second Codex review pass (P1, 2026-07-18) — narrowed FURTHER to require
// an actual CALL, not a bare identifier reference:
//   - `rateLimit(` / `checkRateLimit(` — this repo's / a derived
//     project's wrapper FUNCTION being called.
//   - `aiRatelimit(` — the same wrapper-function shape, `ai`-prefixed
//     naming.
//   - `<name containing rateLimit/Ratelimit/Limiter>.limit(` — an Upstash
//     `Ratelimit` INSTANCE (conventionally named `xLimiter` /
//     `xRatelimit`) actually having `.limit()` invoked on it.
// A bare `\bRatelimit\b` / `\baiRatelimit\b` (no call, no method
// invocation) no longer satisfies this on its own. A bare `.limit(`
// alone still does NOT count (e.g. `query.limit(10)`, a Supabase
// row-count limit) — the receiver must look like a limiter.
const RATE_LIMIT_CALL_RE =
  /\brateLimit\s*\(|\bcheckRateLimit\s*\(|\baiRatelimit\s*\(|\b\w*(?:[Rr]ate[Ll]imit|[Ll]imiter)\w*\s*\.\s*limit\s*\(/;

/** True if `content` contains a direct LLM SDK call or a known in-repo LLM-wrapper import. */
export function hasAiSdkSignal(content: string): boolean {
  const scannable = stripComments(content);
  return AI_SDK_CONTENT_RE.test(scannable) || AI_WRAPPER_IMPORT_RE.test(scannable);
}

/**
 * `content` is optional so callers that only have a path (e.g. a quick
 * path-only filter before reading the file) can still use the path-name
 * half of this check; passing `content` also enables the content-based
 * fallback above.
 */
export function isAiEndpointRoute(path: string, content?: string): boolean {
  if (!/\/route\.tsx?$/.test(path)) return false;
  if (AI_ENDPOINT_PATH_RE.test(path)) return true;
  return content !== undefined && hasAiSdkSignal(content);
}

/**
 * Checklist item 3 ("AI エンドポイントのレートリミット"). Only checks
 * rate-limit WIRING (a grep-able "does this file call a limiter"
 * question) — input-size upper bounds are a separate, product-specific
 * concern documented in SECURITY_CHECKLIST.md but not mechanically
 * checked here (a request body's "reasonable max size" isn't a fixed
 * grep pattern the way "was rateLimit() called" is).
 */
export function findAiRateLimitViolations(files: SourceFile[]): Violation[] {
  const violations: Violation[] = [];

  for (const file of files) {
    const scannable = stripComments(file.content);
    const matchedByPath =
      /\/route\.tsx?$/.test(file.path) && AI_ENDPOINT_PATH_RE.test(file.path);
    const matchedByContent = !matchedByPath && hasAiSdkSignal(file.content);
    if (!matchedByPath && !matchedByContent) continue;
    if (isClientComponent(file.content)) continue; // route handlers never are; kept for symmetry with security-gate-core.ts

    if (RATE_LIMIT_CALL_RE.test(scannable)) continue;

    const reason = matchedByPath
      ? `path matches ${AI_ENDPOINT_PATH_RE}`
      : `imports a known LLM-calling module or SDK (matches ${AI_SDK_CONTENT_RE} or ${AI_WRAPPER_IMPORT_RE})`;

    violations.push({
      rule: "ai-endpoint-no-rate-limit",
      file: file.path,
      line: 1,
      snippet: "",
      message:
        `${file.path} looks like an AI/LLM-calling endpoint (${reason}) but has no rateLimit()/Ratelimit ` +
        `wiring — see lib/rate-limit.ts and [[nextjs_api_routes_no_rate_limit]].`,
    });
  }

  return violations;
}

/**
 * Baseline check: the shared rate-limit module itself must exist AND
 * define an AI/generation-scoped bucket — not just a generic one — so a
 * derived project can't satisfy findAiRateLimitViolations() by pointing
 * every AI route at, say, the login limiter's much tighter/looser window
 * by accident. `rateLimitModuleContent` is `null` when the file doesn't
 * exist at all (e.g. `lib/rate-limit.ts`).
 */
export function findRateLimitModuleViolations(
  rateLimitModulePath: string,
  rateLimitModuleContent: string | null
): Violation[] {
  if (rateLimitModuleContent === null) {
    return [
      {
        rule: "rate-limit-module-missing",
        file: rateLimitModulePath,
        line: 0,
        snippet: "",
        message:
          `${rateLimitModulePath} does not exist — there is no shared rate-limit module for AI endpoints to call. See [[nextjs_api_routes_no_rate_limit]].`,
      },
    ];
  }

  const scannable = stripComments(rateLimitModuleContent);
  const hasAiScopedBucket =
    /generate/i.test(scannable) && /Ratelimit|rateLimit/.test(scannable);
  if (hasAiScopedBucket) return [];

  return [
    {
      rule: "rate-limit-module-missing-ai-bucket",
      file: rateLimitModulePath,
      line: 0,
      snippet: "",
      message:
        `${rateLimitModulePath} has no AI/generation-scoped rate-limit bucket (expected something like a "generate" prefix) — see [[saas_builder_security_debt_inheritance]].`,
    },
  ];
}

// =======================================================================
// 4. Storage bucket policy
// =======================================================================
//
// Ported from a sibling worktree's scripts/security-gate/check-storage-bucket-policy.ts
// (指示書114 integration, 2026-07-20) — a check saas-114's own original
// implementation deliberately left as "manual review only" (no bucket
// migrations existed at the time). Table-level RLS does NOT cover
// `storage.objects` — a bucket left at Supabase's default is
// world-readable regardless of how locked-down the Postgres tables are.
// saas-builder itself still declares no bucket today, so this passes via
// the "nothing declared" branch — see SECURITY_CHECKLIST.md item 4 for
// the induced-failure proof this was tested against.

const INSERT_BUCKET_RE =
  /insert\s+into\s+storage\.buckets\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/gi;
const UPDATE_BUCKET_RE =
  /update\s+storage\.buckets\s+set\s+([^;]*?)\s+where\s+id\s*=\s*'([^']+)'/gi;
const POLICY_ON_STORAGE_OBJECTS_RE = /create\s+policy[\s\S]*?\bon\s+storage\.objects\b[\s\S]*?;/gi;
const BUCKET_ID_IN_POLICY_RE = /bucket_id\s*=\s*'([^']+)'/gi;

interface BucketDecl {
  id: string;
  file: string;
  line: number;
  explicitPublic: boolean;
  kind: "insert" | "update";
}

function splitTopLevelCsv(s: string): string[] {
  return s.split(",").map((v) => v.trim());
}

/** Every `storage.buckets` insert/update declared across all migrations. */
export function findStorageBucketDeclarations(files: SourceFile[]): BucketDecl[] {
  const decls: BucketDecl[] = [];
  for (const file of files) {
    const stripped = stripSqlComments(file.content);

    for (const m of Array.from(stripped.matchAll(INSERT_BUCKET_RE))) {
      const cols = splitTopLevelCsv(m[1]).map((c) => c.replace(/"/g, "").toLowerCase());
      const vals = splitTopLevelCsv(m[2]);
      const idIdx = cols.indexOf("id");
      const rawId = idIdx >= 0 ? (vals[idIdx] ?? "") : "";
      const idMatch = rawId.match(/^'([^']*)'$/);
      const id = idMatch ? idMatch[1] : rawId || "(unknown-id)";
      // Codex review round-3 P2-d: require the ALIGNED value (same index
      // as the "public" column) to be the literal `true`/`false` — NULL,
      // a missing/short values list, or any other expression is NOT
      // explicit and fails the check (checking only that the column was
      // LISTED, not that its VALUE is a concrete boolean, was the bug).
      const publicIdx = cols.indexOf("public");
      const rawPublicVal = publicIdx >= 0 ? (vals[publicIdx] ?? "").trim() : "";
      const explicitPublic = /^(?:true|false)$/i.test(rawPublicVal);
      decls.push({
        id,
        file: file.path,
        line: lineNumberAt(stripped, m.index ?? 0),
        explicitPublic,
        kind: "insert",
      });
    }

    for (const m of Array.from(stripped.matchAll(UPDATE_BUCKET_RE))) {
      const publicAssignMatch = /\bpublic\s*=\s*([^,]+)/i.exec(m[1]);
      const explicitPublic = publicAssignMatch
        ? /^(?:true|false)$/i.test(publicAssignMatch[1].trim())
        : false;
      decls.push({
        id: m[2],
        file: file.path,
        line: lineNumberAt(stripped, m.index ?? 0),
        explicitPublic,
        kind: "update",
      });
    }
  }
  return decls;
}

/** Every bucket id referenced by a `create policy ... on storage.objects ... bucket_id = '<id>'` statement anywhere in migration history. */
export function findStorageObjectsPolicyBucketIds(files: SourceFile[]): Set<string> {
  const ids = new Set<string>();
  for (const file of files) {
    const stripped = stripSqlComments(file.content);
    for (const m of Array.from(stripped.matchAll(POLICY_ON_STORAGE_OBJECTS_RE))) {
      for (const idMatch of Array.from(m[0].matchAll(BUCKET_ID_IN_POLICY_RE))) {
        ids.add(idMatch[1]);
      }
    }
  }
  return ids;
}

/**
 * Bucket IDs (across ALL declarations, insert or update) for which at
 * least one statement anywhere in migration history sets a concrete
 * `true`/`false` `public` value.
 *
 * Codex review P2 (2026-07-20): the prior version evaluated every
 * `storage.buckets` statement INDEPENDENTLY, producing two false
 * positives: (1) a bucket INSERTed without `public`, then a LATER
 * migration explicitly `UPDATE ... SET public = false` — the original
 * insert was still reported even though visibility is definitively
 * established by the later statement; (2) any later unrelated
 * `UPDATE storage.buckets` (e.g. changing `file_size_limit` only, never
 * touching `public`) got flagged even though visibility was already
 * settled by an earlier statement, because THAT statement doesn't restate
 * it either.
 *
 * Fixed by aggregating BY BUCKET ID across the whole (ordered — see
 * scripts/security-baseline-check.ts's migration-file sort) migration
 * history: a bucket's visibility counts as established the moment ANY
 * statement for that ID sets a concrete boolean, and stays established
 * for every statement after that — this is deliberately an OR across
 * history, not "reconstruct the bucket's current live value" (a later
 * statement flipping `public` from `false` to `true` doesn't change
 * whether it was EXPLICITLY DECLARED, which is this gate's actual
 * question — did anyone ever rely on the platform default, not what the
 * value currently is).
 */
export function findStorageBucketVisibilityEstablished(files: SourceFile[]): Set<string> {
  const established = new Set<string>();
  for (const d of findStorageBucketDeclarations(files)) {
    if (d.explicitPublic) established.add(d.id);
  }
  return established;
}

/**
 * Checklist item 4 ("Storage bucket policy explicitly set"). If NO
 * migration declares a bucket at all, this passes vacuously — stated
 * explicitly in the returned state (see scripts/security-baseline-check.ts's
 * log line), not silently skipped, per [[auto_scan_output_empty_silent_success]].
 *
 * One violation per DISTINCT bucket ID (not per statement) — a bucket
 * declared across multiple migrations (e.g. INSERTed once, UPDATEd later)
 * is one bucket with one verdict, reported at its FIRST declaration's
 * file/line (see findStorageBucketVisibilityEstablished()'s doc comment
 * for why per-statement evaluation was wrong).
 */
export function findStorageBucketPolicyViolations(files: SourceFile[]): Violation[] {
  const decls = findStorageBucketDeclarations(files);
  if (decls.length === 0) return [];

  const policyBucketIds = findStorageObjectsPolicyBucketIds(files);
  const visibilityEstablished = findStorageBucketVisibilityEstablished(files);

  const firstDeclByBucket = new Map<string, BucketDecl>();
  for (const d of decls) {
    if (!firstDeclByBucket.has(d.id)) firstDeclByBucket.set(d.id, d);
  }

  const violations: Violation[] = [];
  for (const [id, d] of Array.from(firstDeclByBucket)) {
    const problems: string[] = [];
    if (!visibilityEstablished.has(id)) {
      problems.push(
        "no statement anywhere in migration history sets an explicit `public` value for this bucket"
      );
    }
    if (!policyBucketIds.has(id)) {
      problems.push(
        `no \`create policy ... on storage.objects ... bucket_id = '${id}'\` found in any migration`
      );
    }
    if (problems.length === 0) continue;

    violations.push({
      rule: "no-storage-bucket-policy",
      file: d.file,
      line: d.line,
      snippet: `${d.kind} storage.buckets ... id = '${id}'`,
      message:
        `Bucket "${id}" (first declared ${d.file}:${d.line}) — ${problems.join("; ")}. Table-level RLS does not cover ` +
        `storage.objects; add an explicit \`public\` flag (in this or any statement touching the bucket) and a ` +
        `tenant-scoped policy on storage.objects (see docs/db/rls-migration-template.sql, "storage.objects has its ` +
        `own RLS"). See [[supabase_storage_bucket_policy_missing]].`,
    });
  }
  return violations;
}
