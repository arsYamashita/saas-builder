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
