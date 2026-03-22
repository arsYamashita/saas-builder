import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema } from "../auth";

describe("signupSchema", () => {
  const validInput = {
    email: "test@example.com",
    password: "password123",
    displayName: "Taro",
    tenantName: "My Tenant",
  };

  it("accepts valid input", () => {
    const result = signupSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = signupSchema.safeParse({ ...validInput, email: "not-email" });
    expect(result.success).toBe(false);
  });

  it("rejects empty email", () => {
    const result = signupSchema.safeParse({ ...validInput, email: "" });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = signupSchema.safeParse({ ...validInput, password: "1234567" });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 8-char password", () => {
    const result = signupSchema.safeParse({ ...validInput, password: "12345678" });
    expect(result.success).toBe(true);
  });

  it("rejects empty displayName", () => {
    const result = signupSchema.safeParse({ ...validInput, displayName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty tenantName", () => {
    const result = signupSchema.safeParse({ ...validInput, tenantName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = signupSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  const validInput = {
    email: "test@example.com",
    password: "password123",
  };

  it("accepts valid input", () => {
    const result = loginSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({ ...validInput, email: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = loginSchema.safeParse({ ...validInput, password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = loginSchema.safeParse({ password: "password123" });
    expect(result.success).toBe(false);
  });

  it("rejects missing password", () => {
    const result = loginSchema.safeParse({ email: "test@example.com" });
    expect(result.success).toBe(false);
  });
});
