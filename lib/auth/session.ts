/**
 * Re-exports getAuthSession from @saas/auth. Kept as a local path so
 * existing call sites / test mocks (`vi.mock("@/lib/auth/session", ...)`)
 * keep working unchanged after the extraction — see packages/auth/.
 */
export { getAuthSession } from "@saas/auth";
