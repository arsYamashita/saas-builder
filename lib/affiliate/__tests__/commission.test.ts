import { describe, it, expect, vi, beforeEach } from "vitest";

// See [[affiliate_commission_idempotency_missing]] — createCommission() must
// be safe against Stripe webhook redelivery creating a second commission
// row for the same (subscription_id, affiliate_id) pair.

const mockUpsert = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: mockUpsert,
    }),
  }),
}));

import { createCommission } from "../commission";

describe("createCommission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockImplementation(() => ({ select: mockSelect }));
  });

  it("upserts onto the (subscription_id, affiliate_id) unique constraint with ignoreDuplicates", async () => {
    mockSelect.mockResolvedValue({
      data: [{ id: "commission-1", amount: 500 }],
      error: null,
    });

    const result = await createCommission({
      tenantId: "tenant-1",
      affiliateId: "affiliate-1",
      referralId: "referral-1",
      subscriptionId: "sub-1",
      amount: 500,
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        affiliate_id: "affiliate-1",
        referral_id: "referral-1",
        subscription_id: "sub-1",
        amount: 500,
        status: "pending",
      }),
      {
        onConflict: "subscription_id,affiliate_id",
        ignoreDuplicates: true,
      }
    );
    expect(result).toEqual({ id: "commission-1", amount: 500 });
  });

  it("returns null (no throw) when the DB constraint skips a duplicate delivery", async () => {
    // Simulates a Stripe webhook redelivery for a subscription/affiliate
    // pair that already has a commission row: Postgres skips the insert
    // (ignoreDuplicates), PostgREST returns an empty array, not an error.
    mockSelect.mockResolvedValue({ data: [], error: null });

    const result = await createCommission({
      tenantId: "tenant-1",
      affiliateId: "affiliate-1",
      subscriptionId: "sub-1",
      amount: 500,
    });

    expect(result).toBeNull();
  });

  it("is safe to call twice in a row for the same subscription/affiliate pair (double webhook delivery)", async () => {
    mockSelect
      .mockResolvedValueOnce({ data: [{ id: "commission-1", amount: 500 }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const args = {
      tenantId: "tenant-1",
      affiliateId: "affiliate-1",
      referralId: "referral-1",
      subscriptionId: "sub-1",
      amount: 500,
    };

    const first = await createCommission(args);
    const second = await createCommission(args);

    expect(first).toEqual({ id: "commission-1", amount: 500 });
    expect(second).toBeNull();
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it("throws when the DB reports a real error", async () => {
    mockSelect.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });

    await expect(
      createCommission({
        tenantId: "tenant-1",
        affiliateId: "affiliate-1",
        subscriptionId: "sub-1",
        amount: 500,
      })
    ).rejects.toThrow("Failed to create commission: connection reset");
  });
});
