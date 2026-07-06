/**
 * Re-exports getAuthSession from @saas/auth/server (the server-only
 * entrypoint, guarded by `import "server-only"`). Kept as a local path so
 * existing call sites / test mocks (`vi.mock("@/lib/auth/session", ...)`)
 * keep working unchanged after the extraction — see packages/auth/.
 */
export { getAuthSession } from "@saas/auth/server";
