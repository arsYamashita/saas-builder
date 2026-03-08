import { z } from "zod";

export const projectFormSchema = z.object({
  name: z.string().min(2, "サービス名は2文字以上で入力してください"),
  summary: z.string().min(10, "サービス概要を入力してください"),
  targetUsers: z.string().min(5, "ターゲットユーザーを入力してください"),
  problemToSolve: z.string().min(5, "解決したい課題を入力してください"),
  referenceServices: z.string().optional().default(""),
  brandTone: z.enum([
    "modern",
    "minimal",
    "luxury",
    "friendly",
    "professional",
    "playful",
  ]),

  templateKey: z.enum([
    "membership_content_affiliate",
    "reservation_saas",
    "online_salon",
    "custom",
  ]),

  requiredFeatures: z.array(z.string()).min(1),
  managedData: z.array(z.string()).min(1),
  endUserCreatedData: z.array(z.string()).min(1),

  roles: z
    .array(
      z.enum(["owner", "admin", "staff", "member", "affiliate_manager"])
    )
    .min(1),

  billingModel: z.enum(["subscription", "one_time", "hybrid", "none"]),
  affiliateEnabled: z.boolean(),
  visibilityRule: z.string().min(1),
  mvpScope: z.array(z.string()).min(1),
  excludedInitialScope: z.array(z.string()),

  stackPreference: z.string().min(1),
  notes: z.string().optional().default(""),
  priority: z.enum(["low", "medium", "high"]),
});

export type ProjectFormInput = z.infer<typeof projectFormSchema>;
