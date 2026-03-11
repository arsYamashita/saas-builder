import { describe, it, expect } from "vitest";
import { membershipPlanFormSchema } from "../membership-plan";

describe("membershipPlanFormSchema", () => {
  it("accepts valid minimal input", () => {
    const result = membershipPlanFormSchema.safeParse({ name: "Basic" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Basic");
      expect(result.data.description).toBe("");
      expect(result.data.status).toBe("active");
    }
  });

  it("accepts full input", () => {
    const result = membershipPlanFormSchema.safeParse({
      name: "Premium",
      description: "Premium plan",
      price_id: "price_123",
      status: "inactive",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Premium");
      expect(result.data.description).toBe("Premium plan");
      expect(result.data.price_id).toBe("price_123");
      expect(result.data.status).toBe("inactive");
    }
  });

  it("rejects empty name", () => {
    const result = membershipPlanFormSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "プラン名を入力してください"
      );
    }
  });

  it("rejects missing name", () => {
    const result = membershipPlanFormSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects null name", () => {
    const result = membershipPlanFormSchema.safeParse({ name: null });
    expect(result.success).toBe(false);
  });

  it("rejects non-string name", () => {
    const result = membershipPlanFormSchema.safeParse({ name: 42 });
    expect(result.success).toBe(false);
  });

  it("accepts null price_id", () => {
    const result = membershipPlanFormSchema.safeParse({
      name: "Test",
      price_id: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price_id).toBeNull();
    }
  });

  it("accepts undefined price_id", () => {
    const result = membershipPlanFormSchema.safeParse({ name: "Test" });
    expect(result.success).toBe(true);
  });

  it("rejects empty status", () => {
    const result = membershipPlanFormSchema.safeParse({
      name: "Test",
      status: "",
    });
    expect(result.success).toBe(false);
  });

  it("defaults status to active", () => {
    const result = membershipPlanFormSchema.safeParse({ name: "Test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("active");
    }
  });
});
