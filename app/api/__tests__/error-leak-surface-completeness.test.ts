/**
 * "列挙完全性" (enumeration completeness) check for the internal-error-leak
 * wiring tests — see docs/testing/error-leak-surfaces.md.
 *
 * This test does NOT itself check response bodies (each route's own
 * `__tests__/error-leak.test.ts` does that). It guarantees the *inventory*
 * can't silently rot:
 *
 *  - every `route.ts` under app/api/ must have a matching entry in
 *    lib/api/error-leak-registry.ts (add a route without adding a leak
 *    test + registry entry → this fails);
 *  - every registry entry must point at a test file that actually exists
 *    on disk (a stale/renamed entry → this fails, instead of silently
 *    testing nothing);
 *  - the registry can't shrink below the current known surface count
 *    (guards against an empty/truncated registry being a false "pass" —
 *    the "偽成功対策" requirement from the M2 instruction);
 *  - no SSE/WebSocket-shaped output path exists yet; if one is added, this
 *    canary fails so the docs + registry get updated deliberately instead
 *    of the new streaming surface silently going unaudited.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ERROR_LEAK_SURFACES } from "@/lib/api/error-leak-registry";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const APP_API_DIR = join(REPO_ROOT, "app", "api");

/** The known-good count as of 2026-07-06 (docs/testing/error-leak-surfaces.md).
 *  Bump this UP when you add a route (with its registry entry + test); never
 *  bump it down without removing the corresponding route. */
const MIN_KNOWN_SURFACE_COUNT = 37;

function findRouteFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      found.push(...findRouteFiles(full));
    } else if (entry === "route.ts") {
      found.push(relative(REPO_ROOT, full));
    }
  }
  return found;
}

/** Recursively scans app/ and lib/ (excluding node_modules/__tests__/exports)
 *  for streaming-shaped output paths that this registry doesn't yet cover. */
function findStreamingSurfaceCandidates(dir: string): string[] {
  const STREAMING_MARKERS = [
    "ReadableStream",
    "EventSource",
    "text/event-stream",
    "WebSocket",
    "socket.io",
  ];
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", "__tests__", "exports", ".next"].includes(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      found.push(...findStreamingSurfaceCandidates(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      const content = readFileSync(full, "utf-8");
      if (STREAMING_MARKERS.some((marker) => content.includes(marker))) {
        found.push(relative(REPO_ROOT, full));
      }
    }
  }
  return found;
}

describe("error-leak-surfaces registry — enumeration completeness", () => {
  it("has at least the known floor of registered route surfaces (no silent shrinkage)", () => {
    expect(ERROR_LEAK_SURFACES.length).toBeGreaterThanOrEqual(MIN_KNOWN_SURFACE_COUNT);
  });

  it("covers every app/api/**/route.ts with exactly one registry entry", () => {
    const actualRoutes = findRouteFiles(APP_API_DIR)
      .map((p) => p.split("\\").join("/")) // normalize on Windows CI runners
      .sort();
    const registeredRoutes = ERROR_LEAK_SURFACES.map((s) => s.route).sort();

    const missingFromRegistry = actualRoutes.filter(
      (r) => !registeredRoutes.includes(r)
    );
    const staleInRegistry = registeredRoutes.filter(
      (r) => !actualRoutes.includes(r)
    );

    expect(
      missingFromRegistry,
      `New route(s) added without an error-leak registry entry + test. ` +
        `Add a "<route-dir>/__tests__/error-leak.test.ts" and register it in ` +
        `lib/api/error-leak-registry.ts (see docs/testing/error-leak-surfaces.md).`
    ).toEqual([]);

    expect(
      staleInRegistry,
      `Registry references route(s) that no longer exist — remove the stale ` +
        `entry (and its test, if orphaned) from lib/api/error-leak-registry.ts.`
    ).toEqual([]);

    // No duplicate route entries either.
    expect(new Set(registeredRoutes).size).toBe(registeredRoutes.length);
  });

  it("every registered test file actually exists on disk", () => {
    const missingTestFiles: string[] = [];
    for (const surface of ERROR_LEAK_SURFACES) {
      for (const testFile of surface.testFiles) {
        if (!existsSync(join(REPO_ROOT, testFile))) {
          missingTestFiles.push(`${surface.route} -> ${testFile}`);
        }
      }
    }
    expect(
      missingTestFiles,
      "Registry entries pointing at test files that don't exist (stale rename/deletion?)"
    ).toEqual([]);
  });

  it("has no un-inventoried SSE/WebSocket streaming surface", () => {
    const candidates = findStreamingSurfaceCandidates(join(REPO_ROOT, "app")).concat(
      findStreamingSurfaceCandidates(join(REPO_ROOT, "lib"))
    );
    expect(
      candidates,
      "A streaming (SSE/WebSocket) output path was introduced. It must be " +
        "added to docs/testing/error-leak-surfaces.md's inventory and given " +
        "its own leak wiring test (does an aborted/errored stream ever emit " +
        "raw error detail in an event payload?) before this canary can pass."
    ).toEqual([]);
  });
});
