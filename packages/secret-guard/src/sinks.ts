import { mask } from "./mask";

/**
 * The five output routes a secret can escape through, per the 2026-07-06
 * design ("全出力経路を列挙→配線テストで固定"). This list is the contract:
 * every consumer of this package is expected to call `registerSink()` once
 * per concrete call site, tagged with the `SinkKind` it represents. A test
 * (see `assertAllKindsRegistered` / `__tests__/sinks.test.ts`) then fails
 * loudly if a whole *kind* of route has no registered sink at all — the
 * "未登録経路検出" (undetected-route detection) requirement.
 *
 * This deliberately does NOT try to statically find every call site in a
 * codebase (that's gitleaks's job, via ci/gitleaks.toml). It only catches
 * one specific failure mode: a team ships a new category of output route
 * and nobody wires masking into it at all. Registering a sink is a manual,
 * explicit act — same trade-off `registerSink()`-style DI containers make
 * everywhere: harder to forget silently, easy to verify with a test.
 */
export type SinkKind =
  | "log"
  | "http_response"
  | "error_message"
  | "url_query"
  | "artifact_file";

export const ALL_SINK_KINDS: readonly SinkKind[] = [
  "log",
  "http_response",
  "error_message",
  "url_query",
  "artifact_file",
];

export interface SinkRegistration {
  kind: SinkKind;
  /** Human-readable call-site description, e.g. "lib/api/errors.ts console.error". */
  name: string;
}

export interface RegisteredSink extends SinkRegistration {
  /** Masks `input` the same way this sink is wired to mask it in production. */
  mask: (input: string) => string;
}

const registry = new Map<string, RegisteredSink>();

function key(reg: SinkRegistration): string {
  return `${reg.kind}:${reg.name}`;
}

/**
 * Registers one concrete output call site as "masking-wired". Returns the
 * masking function the call site should actually use — call this once at
 * module load next to the real sink (console.error call, NextResponse.json,
 * URL constructor, file writer, ...) and use the returned function instead
 * of passing raw strings through.
 *
 * Throws on duplicate registration (same kind+name) — a copy-pasted
 * registration masking two different things is a bug, not a no-op.
 */
export function registerSink(reg: SinkRegistration): (input: string) => string {
  const k = key(reg);
  if (registry.has(k)) {
    throw new Error(`secret-guard: sink already registered: ${k}`);
  }
  const entry: RegisteredSink = { ...reg, mask };
  registry.set(k, entry);
  return mask;
}

/** For tests only: clears the registry so test files don't leak state into each other. */
export function _resetRegistryForTests(): void {
  registry.clear();
}

export function listRegisteredSinks(): RegisteredSink[] {
  // Array.from (not `[...registry.values()]`) — the root tsconfig's target
  // predates native Map iteration via spread/for-of without
  // --downlevelIteration.
  return Array.from(registry.values());
}

/**
 * Asserts every kind in `required` (defaults to all five) has at least one
 * registered sink. This is the "未登録経路検出テスト": run it in CI and a
 * new output route category that nobody wired masking into fails the build
 * instead of shipping silently unmasked.
 */
export function assertAllKindsRegistered(
  required: readonly SinkKind[] = ALL_SINK_KINDS
): void {
  const registeredKinds = new Set(listRegisteredSinks().map((s) => s.kind));
  const missing = required.filter((k) => !registeredKinds.has(k));
  if (missing.length > 0) {
    throw new Error(
      `secret-guard: no sink registered for output route kind(s): ${missing.join(
        ", "
      )}. Call registerSink({ kind, name }) at the real call site (see README.md).`
    );
  }
}
