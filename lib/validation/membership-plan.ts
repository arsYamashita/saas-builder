import { z } from "zod";

export const membershipPlanFormSchema = z.object({
  name: z.string().min(1, "プラン名を入力してください"),
  description: z.string().optional().default(""),
  price_id: z.string().optional().nullable(),
  status: z.string().min(1).default("active"),
});

export type MembershipPlanFormInput = z.infer<
  typeof membershipPlanFormSchema
>;

/**
 * Extended schema used when creating a plan together with Stripe Product/Price.
 * amount is in the smallest currency unit (e.g. yen for JPY, cents for USD).
 */
export const membershipPlanWithPricingSchema = membershipPlanFormSchema.extend({
  amount: z
    .number()
    .int()
    .positive("金額は1以上の整数を入力してください")
    .optional()
    .nullable(),
  currency: z.string().min(1).default("jpy"),
  interval: z.enum(["month", "year"]).optional().nullable(),
  trial_days: z.number().int().min(0).optional().nullable(),
});

export type MembershipPlanWithPricingInput = z.infer<
  typeof membershipPlanWithPricingSchema
>;
