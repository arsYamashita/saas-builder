import { z } from "zod";
import { getRegisteredTemplateKeys } from "@/lib/templates/template-registry";
import {
  MAX_LLM_BRIEF_FIELD_CHARS,
  MAX_LLM_ARRAY_ITEM_CHARS,
  MAX_LLM_ARRAY_ITEMS,
} from "./llm-input-limits";

/** Template keys from registry + non-registry placeholders. */
const TEMPLATE_KEY_ENUM = [
  ...getRegisteredTemplateKeys(),
  "online_salon",
  "custom",
] as [string, ...string[]];

// project-form fields feed lib/ai's generate-blueprint prompt via
// buildUserInputFromProject() — cap free-text fields so a single onboarding
// submission can't smuggle megabytes of text into the LLM prompt.
// See KB: llm_api_unbounded_text_input.
const briefTextField = (message: string) =>
  z
    .string()
    .max(MAX_LLM_BRIEF_FIELD_CHARS, `${message}（最大 ${MAX_LLM_BRIEF_FIELD_CHARS} 文字）`);

// Array fields (feature/data labels) need BOTH a per-item cap and a count
// cap — N short items still add up to megabytes without a count limit.
// Codex review (指示書043) flagged the earlier per-item-only version: 5
// arrays x 200 items x 10,000 chars = ~10M aggregate chars into a single
// paid blueprint-generation LLM call.
const briefArrayItem = (message: string) =>
  z
    .string()
    .max(MAX_LLM_ARRAY_ITEM_CHARS, `${message}（項目は最大 ${MAX_LLM_ARRAY_ITEM_CHARS} 文字）`);

const briefStringArray = (message: string) =>
  z
    .array(briefArrayItem(message))
    .max(MAX_LLM_ARRAY_ITEMS, `項目数が多すぎます（最大${MAX_LLM_ARRAY_ITEMS}件）`);

export const projectFormSchema = z.object({
  name: briefTextField("サービス名が長すぎます").min(2, "サービス名は2文字以上で入力してください"),
  summary: briefTextField("サービス概要が長すぎます").min(10, "サービス概要を入力してください"),
  targetUsers: briefTextField("ターゲットユーザーが長すぎます").min(5, "ターゲットユーザーを入力してください"),
  problemToSolve: briefTextField("解決したい課題が長すぎます").min(5, "解決したい課題を入力してください"),
  referenceServices: briefTextField("参考サービスが長すぎます").optional().default(""),
  brandTone: z.enum([
    "modern",
    "minimal",
    "luxury",
    "friendly",
    "professional",
    "playful",
  ]),

  templateKey: z.enum(TEMPLATE_KEY_ENUM),

  requiredFeatures: briefStringArray("必須機能の項目が長すぎます").min(1),
  managedData: briefStringArray("管理データの項目が長すぎます").min(1),
  endUserCreatedData: briefStringArray("エンドユーザー作成データの項目が長すぎます"),

  // roles is enum-constrained per item, but with no count cap a caller could
  // still submit e.g. millions of repeated enum values; JSON.stringify(meta.roles)
  // is interpolated into the blueprint-generation prompt just like the other
  // arrays above, so it needs the same item-count bound. Codex review 指示書043 P1.
  roles: z
    .array(
      z.enum(["owner", "admin", "editor", "staff", "member", "affiliate_manager", "sales", "operator"])
    )
    .min(1)
    .max(MAX_LLM_ARRAY_ITEMS, `ロールの項目数が多すぎます（最大${MAX_LLM_ARRAY_ITEMS}件）`),

  billingModel: z.enum(["subscription", "one_time", "hybrid", "none"]),
  affiliateEnabled: z.boolean(),
  visibilityRule: briefTextField("公開範囲が長すぎます").min(1),
  mvpScope: briefStringArray("MVP範囲の項目が長すぎます").min(1),
  excludedInitialScope: briefStringArray("除外範囲の項目が長すぎます"),

  stackPreference: briefTextField("技術スタックが長すぎます").min(1),
  notes: briefTextField("備考が長すぎます").optional().default(""),
  priority: z.enum(["low", "medium", "high"]),
});

export type ProjectFormInput = z.infer<typeof projectFormSchema>;
