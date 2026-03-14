// ============================================================
// access.ts — Unit Tests
// ============================================================
// checkContentAccess の純粋ロジック部分をテスト。
// Supabase client をモックして評価フローを検証。
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock setup ───

const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
}));

// chain builder
function chainBuilder(returnData: unknown, returnError: unknown = null) {
  const chain: Record<string, unknown> = {};
  const handler = () => chain;
  chain.select = handler;
  chain.eq = handler;
  chain.limit = handler;
  chain.single = () => ({ data: returnData, error: returnError });
  chain.maybeSingle = () => ({ data: returnData, error: returnError });
  return chain;
}

function chainBuilderList(returnData: unknown[], returnError: unknown = null) {
  const chain: Record<string, unknown> = {};
  const handler = () => chain;
  chain.select = handler;
  chain.eq = handler;
  chain.limit = handler;
  chain.single = () => ({ data: returnData[0] ?? null, error: returnError });
  chain.maybeSingle = () => ({ data: returnData[0] ?? null, error: returnError });
  // For rules query that returns array
  Object.defineProperty(chain, '__isRulesQuery', { value: true });
  return { data: returnData, error: returnError };
}

// Track from() calls to return different chains
let fromCallIndex = 0;
let fromResponses: Array<{ data: unknown; error: unknown; isList?: boolean }> = [];

function setupMockResponses(responses: Array<{ data: unknown; error?: unknown; isList?: boolean }>) {
  fromCallIndex = 0;
  fromResponses = responses.map(r => ({ ...r, error: r.error ?? null }));

  mockFrom.mockImplementation(() => {
    const idx = fromCallIndex++;
    const resp = fromResponses[idx] ?? { data: null, error: null };

    const chain: Record<string, unknown> = {};
    const handler = () => chain;
    chain.select = handler;
    chain.eq = handler;
    chain.limit = handler;
    chain.single = () => ({ data: resp.data, error: resp.error });
    chain.maybeSingle = () => ({ data: resp.data, error: resp.error });

    // If isList, the query chain resolves to an array (for rules query)
    if (resp.isList) {
      // Override to return data as array at the end of chain (no .single())
      // The actual code does NOT call .single() on the rules query
      // It gets { data: rules, error } directly from the last .eq()
      const listChain: Record<string, unknown> = {};
      const listHandler = () => {
        // Return the data/error when the chain terminates
        (listChain as { data: unknown }).data = resp.data;
        (listChain as { error: unknown }).error = resp.error;
        return listChain;
      };
      listChain.select = listHandler;
      listChain.eq = listHandler;
      listChain.data = resp.data;
      listChain.error = resp.error;

      // Supabase returns a thenable. Actually in the code it does:
      // const { data: rules, error } = await supabase.from(...).select(...).eq(...).eq(...)
      // So we need it to be awaitable and destructurable
      const result = { data: resp.data, error: resp.error };
      const promiseLike = {
        select: () => promiseLike,
        eq: () => promiseLike,
        then: (resolve: (v: unknown) => void) => resolve(result),
      };
      return promiseLike;
    }

    return chain;
  });
}

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

// ─── Import after mocks ───
const { checkContentAccess } = await import("../access");

// ─── Tests ───

describe("checkContentAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallIndex = 0;
  });

  it("returns content_not_found when content does not exist", async () => {
    setupMockResponses([
      { data: null, error: { message: "not found" } },
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: null,
      userRole: null,
      membershipStatus: null,
    });

    expect(result).toEqual({ allowed: false, reason: "content_not_found" });
  });

  it("allows public published content for unauthenticated user", async () => {
    setupMockResponses([
      { data: { id: "c1", tenant_id: "t1", status: "published", visibility_mode: "public" } },
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: null,
      userRole: null,
      membershipStatus: null,
    });

    expect(result).toEqual({ allowed: true, reason: "public" });
  });

  it("denies draft content for non-editor", async () => {
    setupMockResponses([
      { data: { id: "c1", tenant_id: "t1", status: "draft", visibility_mode: "members_only" } },
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: "u1",
      userRole: "member",
      membershipStatus: "active",
    });

    expect(result).toEqual({ allowed: false, reason: "not_published" });
  });

  it("allows draft content for editor", async () => {
    setupMockResponses([
      { data: { id: "c1", tenant_id: "t1", status: "draft", visibility_mode: "members_only" } },
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: "u1",
      userRole: "editor",
      membershipStatus: "active",
    });

    expect(result).toEqual({ allowed: true, reason: "editor_preview" });
  });

  it("denies suspended member", async () => {
    setupMockResponses([
      { data: { id: "c1", tenant_id: "t1", status: "published", visibility_mode: "members_only" } },
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: "u1",
      userRole: "member",
      membershipStatus: "suspended",
    });

    expect(result).toEqual({ allowed: false, reason: "membership_suspended" });
  });

  it("denies members_only for unauthenticated", async () => {
    setupMockResponses([
      { data: { id: "c1", tenant_id: "t1", status: "published", visibility_mode: "members_only" } },
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: null,
      userRole: null,
      membershipStatus: null,
    });

    expect(result).toEqual({ allowed: false, reason: "authentication_required" });
  });

  it("allows members_only for active member", async () => {
    setupMockResponses([
      { data: { id: "c1", tenant_id: "t1", status: "published", visibility_mode: "members_only" } },
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: "u1",
      userRole: "member",
      membershipStatus: "active",
    });

    expect(result).toEqual({ allowed: true, reason: "members_only" });
  });

  it("denies rules_based with no rules defined", async () => {
    setupMockResponses([
      { data: { id: "c1", tenant_id: "t1", status: "published", visibility_mode: "rules_based" } },
      { data: [], isList: true },
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: "u1",
      userRole: "member",
      membershipStatus: "active",
    });

    expect(result).toEqual({ allowed: false, reason: "no_rules_defined" });
  });

  it("allows rules_based with matching plan subscription", async () => {
    setupMockResponses([
      { data: { id: "c1", tenant_id: "t1", status: "published", visibility_mode: "rules_based" } },
      // rules query
      { data: [{ rule_type: "plan_based", plan_id: "p1", tag_id: null }], isList: true },
      // plan check
      { data: { id: "sub1" } },
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: "u1",
      userRole: "member",
      membershipStatus: "active",
    });

    expect(result).toEqual({ allowed: true, reason: "plan_based" });
  });

  it("denies rules_based when plan does not match", async () => {
    setupMockResponses([
      { data: { id: "c1", tenant_id: "t1", status: "published", visibility_mode: "rules_based" } },
      { data: [{ rule_type: "plan_based", plan_id: "p1", tag_id: null }], isList: true },
      { data: null }, // no matching subscription
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: "u1",
      userRole: "member",
      membershipStatus: "active",
    });

    expect(result).toEqual({ allowed: false, reason: "rules_not_satisfied" });
  });

  it("allows rules_based with completed purchase", async () => {
    setupMockResponses([
      { data: { id: "c1", tenant_id: "t1", status: "published", visibility_mode: "rules_based" } },
      { data: [{ rule_type: "purchase_based", plan_id: null, tag_id: null }], isList: true },
      { data: { id: "pur1" } }, // completed purchase
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: "u1",
      userRole: "member",
      membershipStatus: "active",
    });

    expect(result).toEqual({ allowed: true, reason: "purchase_based" });
  });

  it("allows rules_based with matching tag", async () => {
    setupMockResponses([
      { data: { id: "c1", tenant_id: "t1", status: "published", visibility_mode: "rules_based" } },
      { data: [{ rule_type: "tag_based", plan_id: null, tag_id: "tag1" }], isList: true },
      { data: { id: "ut1" } }, // matching user_tag
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: "u1",
      userRole: "member",
      membershipStatus: "active",
    });

    expect(result).toEqual({ allowed: true, reason: "tag_based" });
  });

  it("OR evaluation: second rule matches after first fails", async () => {
    setupMockResponses([
      { data: { id: "c1", tenant_id: "t1", status: "published", visibility_mode: "rules_based" } },
      { data: [
        { rule_type: "plan_based", plan_id: "p1", tag_id: null },
        { rule_type: "purchase_based", plan_id: null, tag_id: null },
      ], isList: true },
      { data: null },       // plan check fails
      { data: { id: "pur1" } }, // purchase check succeeds
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: "u1",
      userRole: "member",
      membershipStatus: "active",
    });

    expect(result).toEqual({ allowed: true, reason: "purchase_based" });
  });

  it("denies non-member for members_only content", async () => {
    setupMockResponses([
      { data: { id: "c1", tenant_id: "t1", status: "published", visibility_mode: "members_only" } },
    ]);

    const result = await checkContentAccess({
      contentId: "c1",
      tenantId: "t1",
      userId: "u1",
      userRole: null,
      membershipStatus: "inactive",
    });

    expect(result).toEqual({ allowed: false, reason: "membership_required" });
  });
});
