/**
 * @saas/idempotency — shared idempotency guard for saas-builder and
 * generated templates.
 *
 * See README.md for usage. Three independent primitives, share one
 * backing store where useful:
 *
 *   - `withRoute()`     — Next.js Idempotency-Key HTTP middleware.
 *   - `withIdempotency()` / `withStripeCall()` — generic side-effect guard.
 *   - `withLock()`      — Redis distributed lock with heartbeat extension.
 */
export type {
  ClaimOutcome,
  IdempotencyScope,
  IdempotencyStore,
  RunIdempotentOptions,
} from "./types";
export { IdempotencyInProgressError } from "./types";

export {
  InMemoryIdempotencyStore,
  createSupabaseIdempotencyStore,
} from "./store";
export type {
  SupabaseLike,
  SupabaseFilterChain,
  SupabaseQueryBuilder,
  SupabaseIdempotencyStoreOptions,
} from "./store";

export { createIdempotency, DEFAULT_SCOPE, DEFAULT_TTL_MS } from "./core";
export type { Idempotency, IdempotencyDefaults } from "./core";

export { withRoute } from "./middleware";
export type { RouteHandler, WithRouteOptions } from "./middleware";

export {
  acquireLock,
  releaseLock,
  extendLock,
  withLock,
  LockContentionError,
} from "./lock";
export type { RedisLike, WithLockOptions } from "./lock";
