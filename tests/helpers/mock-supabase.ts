/**
 * Lightweight Supabase mock for unit tests.
 *
 * Usage in test files:
 *   vi.mock("@/lib/db/supabase/admin", () => ({
 *     createAdminClient: () => createMockSupabaseClient(mockData),
 *   }));
 */

type MockQueryResult<T = Record<string, unknown>> = {
  data: T | T[] | null;
  error: { message: string } | null;
};

interface MockSupabaseConfig {
  /** Default data returned by select queries */
  selectData?: Record<string, unknown>[] | Record<string, unknown> | null;
  /** Default data returned by insert/upsert/update queries */
  mutationData?: Record<string, unknown> | null;
  /** Error to return (if any) */
  error?: string | null;
}

/**
 * Creates a chainable mock Supabase client.
 * All query builder methods return `this` for chaining,
 * except terminal methods (single, maybeSingle) which resolve the result.
 */
export function createMockSupabaseClient(config: MockSupabaseConfig = {}) {
  const result: MockQueryResult = {
    data: config.selectData ?? null,
    error: config.error ? { message: config.error } : null,
  };

  const mutationResult: MockQueryResult = {
    data: config.mutationData ?? null,
    error: config.error ? { message: config.error } : null,
  };

  const chainable = {
    select: () => chainable,
    insert: () => ({ ...chainable, data: mutationResult.data, error: mutationResult.error }),
    update: () => ({ ...chainable, data: mutationResult.data, error: mutationResult.error }),
    upsert: () => ({ ...chainable, data: mutationResult.data, error: mutationResult.error }),
    delete: () => chainable,
    eq: () => chainable,
    neq: () => chainable,
    gt: () => chainable,
    lt: () => chainable,
    gte: () => chainable,
    lte: () => chainable,
    in: () => chainable,
    is: () => chainable,
    or: () => chainable,
    order: () => chainable,
    limit: () => chainable,
    range: () => chainable,
    single: () => Promise.resolve({
      data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
      error: result.error,
    }),
    maybeSingle: () => Promise.resolve({
      data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
      error: result.error,
    }),
    then: (resolve: (v: MockQueryResult) => void) => resolve(result),
  };

  return {
    from: () => chainable,
    rpc: () => Promise.resolve(result),
  };
}
