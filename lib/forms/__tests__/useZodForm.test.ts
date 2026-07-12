import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

/**
 * `useZodForm` itself is a ~10-line wrapper around `useForm` +
 * `zodResolver(schema)` — there is no logic in it beyond wiring the two
 * together, so the meaningful thing to unit test is that wiring: does
 * `zodResolver(schema)` (the exact call `useZodForm` makes) turn schema
 * validation results into the shape react-hook-form expects?
 *
 * This repo has no DOM test environment configured (no jsdom /
 * @testing-library/react — `vitest.config.ts` runs plain Node), so these
 * tests exercise the resolver function directly rather than rendering the
 * hook. `zodResolver`'s returned function has the exact
 * `(values, context, options) => Promise<{ values, errors }>` signature
 * react-hook-form calls on every validation pass, independent of React.
 */

const resolverOptions = { fields: {}, shouldUseNativeValidation: false } as const;

const loginLikeSchema = z.object({
  email: z.string().email("正しいメールアドレスを入力してください"),
  password: z.string().min(8, "パスワードは8文字以上にしてください"),
});

describe("useZodForm's resolver wiring (zodResolver behavior)", () => {
  it("returns the parsed values and no errors for valid input", async () => {
    const resolver = zodResolver(loginLikeSchema);
    const result = await resolver(
      { email: "user@example.com", password: "password123" },
      undefined,
      resolverOptions as any
    );

    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ email: "user@example.com", password: "password123" });
  });

  it("maps each invalid field to a react-hook-form error entry with the schema's message", async () => {
    const resolver = zodResolver(loginLikeSchema);
    const result = await resolver(
      { email: "not-an-email", password: "short" },
      undefined,
      resolverOptions as any
    );

    expect(result.values).toEqual({});
    expect(result.errors.email?.message).toBe("正しいメールアドレスを入力してください");
    expect(result.errors.password?.message).toBe("パスワードは8文字以上にしてください");
  });

  it("only reports the fields that actually fail", async () => {
    const resolver = zodResolver(loginLikeSchema);
    const result = await resolver(
      { email: "user@example.com", password: "short" },
      undefined,
      resolverOptions as any
    );

    expect(result.errors.email).toBeUndefined();
    expect(result.errors.password?.message).toBe("パスワードは8文字以上にしてください");
  });

  it("works the same way with a .pick()'d subset of a larger canonical schema", async () => {
    // Mirrors the `projectBasicInfoSchema = projectFormSchema.pick({...})`
    // pattern used to migrate app/(builder)/projects/new/page.tsx: the form
    // only manages a subset of a larger schema's fields.
    const canonicalSchema = z.object({
      name: z.string().min(2, "サービス名は2文字以上で入力してください"),
      summary: z.string().min(10, "サービス概要を入力してください"),
      billingModel: z.enum(["subscription", "one_time", "hybrid", "none"]),
    });
    const basicInfoSchema = canonicalSchema.pick({ name: true, summary: true });
    const resolver = zodResolver(basicInfoSchema);

    const result = await resolver({ name: "A", summary: "" }, undefined, resolverOptions as any);

    expect(result.errors.name?.message).toBe("サービス名は2文字以上で入力してください");
    expect(result.errors.summary?.message).toBe("サービス概要を入力してください");
    // The subset schema never sees `billingModel` at all.
    expect((result.errors as Record<string, unknown>).billingModel).toBeUndefined();
  });
});
