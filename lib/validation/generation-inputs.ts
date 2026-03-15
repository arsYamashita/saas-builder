/**
 * Generation Inputs — Template-specific input validation schemas.
 *
 * Each template defines required and optional parameters that the
 * Builder UI / CLI reads from manifest.json and validates at generation time.
 *
 * This module provides:
 *   1. Zod schemas for each template's generation inputs
 *   2. Field descriptors for UI form generation
 *   3. A registry to look up both by template_key
 *
 * Adding a new template:
 *   1. Define a zod schema (xxxGenerationInputsSchema)
 *   2. Define field descriptors (xxxFields)
 *   3. Register both in GENERATION_INPUTS_REGISTRY
 */

import { z } from "zod";

// ─── Shared types ───

export type FieldDescriptor = {
  key: string;
  type: string;
  required: boolean;
  label: string;
  placeholder?: string;
  pattern?: string;
  default?: unknown;
  enum?: string[];
  itemSchema?: string;
};

export type GenerationInputsEntry = {
  schema: z.ZodType;
  fields: FieldDescriptor[];
};

// ─── Shared field schemas ───

export const slugField = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "slug は英小文字・数字・ハイフンのみ (先頭末尾はハイフン不可)");

export const emailField = z.string().email("有効なメールアドレスを入力してください");

export const currencyField = z
  .string()
  .length(3)
  .regex(/^[a-z]{3}$/, "ISO 4217 通貨コード (3文字小文字)")
  .default("jpy");

// ─── community_membership_saas ───

const planDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceAmount: z.number().int().min(0),
  currency: currencyField,
  features: z.array(z.string()).default([]),
  sortOrder: z.number().int().min(0).default(0),
});

const tagDefinitionSchema = z.object({
  name: z.string().min(1),
  slug: slugField,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const cmsGenerationInputsSchema = z.object({
  // Required
  tenantName: z.string().min(1, "テナント名は必須です"),
  tenantSlug: slugField,
  ownerEmail: emailField,
  defaultCurrency: currencyField,

  // Optional
  brandTone: z
    .enum(["modern", "minimal", "luxury", "friendly", "professional", "playful"])
    .default("modern"),
  initialPlans: z.array(planDefinitionSchema).default([]),
  initialTags: z.array(tagDefinitionSchema).default([]),
  stripeAccountId: z.string().optional(),
  customDomain: z.string().optional(),
});

export type CmsGenerationInputs = z.infer<typeof cmsGenerationInputsSchema>;

const cmsFields: FieldDescriptor[] = [
  { key: "tenantName", type: "string", required: true, label: "テナント名", placeholder: "My Community" },
  { key: "tenantSlug", type: "string", required: true, label: "URL スラグ", placeholder: "my-community", pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$" },
  { key: "ownerEmail", type: "email", required: true, label: "オーナーメール" },
  { key: "defaultCurrency", type: "string", required: true, label: "通貨", default: "jpy", enum: ["jpy", "usd", "eur"] },
  { key: "brandTone", type: "select", required: false, label: "ブランドトーン", default: "modern", enum: ["modern", "minimal", "luxury", "friendly", "professional", "playful"] },
  { key: "initialPlans", type: "array", required: false, label: "初期プラン", itemSchema: "PlanDefinition" },
  { key: "initialTags", type: "array", required: false, label: "初期タグ", itemSchema: "TagDefinition" },
  { key: "stripeAccountId", type: "string", required: false, label: "Stripe Account ID" },
  { key: "customDomain", type: "string", required: false, label: "カスタムドメイン" },
];

// ─── internal_admin_ops_saas ───

export const iaoGenerationInputsSchema = z.object({
  // Required
  tenantName: z.string().min(1, "組織名は必須です"),
  tenantSlug: slugField,
  ownerEmail: emailField,

  // Optional
  brandTone: z
    .enum(["modern", "minimal", "luxury", "friendly", "professional", "playful"])
    .default("professional"),
  initialCategories: z
    .array(z.object({
      name: z.string().min(1),
      slug: slugField,
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    }))
    .default([]),
  requireApproval: z.boolean().default(true),
});

export type IaoGenerationInputs = z.infer<typeof iaoGenerationInputsSchema>;

const iaoFields: FieldDescriptor[] = [
  { key: "tenantName", type: "string", required: true, label: "組織名", placeholder: "株式会社サンプル" },
  { key: "tenantSlug", type: "string", required: true, label: "URL スラグ", placeholder: "sample-corp", pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$" },
  { key: "ownerEmail", type: "email", required: true, label: "管理者メール" },
  { key: "brandTone", type: "select", required: false, label: "ブランドトーン", default: "professional", enum: ["modern", "minimal", "luxury", "friendly", "professional", "playful"] },
  { key: "initialCategories", type: "array", required: false, label: "初期カテゴリ", itemSchema: "CategoryDefinition" },
  { key: "requireApproval", type: "boolean", required: false, label: "承認フロー有効", default: true },
];

// ─── simple_crm_saas ───

const dealStageSchema = z.object({
  name: z.string().min(1),
  slug: slugField,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export const crmGenerationInputsSchema = z.object({
  // Required
  tenantName: z.string().min(1, "組織名は必須です"),
  tenantSlug: slugField,
  ownerEmail: emailField,

  // Optional
  brandTone: z
    .enum(["modern", "minimal", "luxury", "friendly", "professional", "playful"])
    .default("professional"),
  initialDealStages: z.array(dealStageSchema).default([]),
  initialContactStatuses: z
    .array(z.enum(["lead", "prospect", "active", "inactive", "churned"]))
    .default(["lead", "prospect", "active", "inactive"]),
});

export type CrmGenerationInputs = z.infer<typeof crmGenerationInputsSchema>;

const crmFields: FieldDescriptor[] = [
  { key: "tenantName", type: "string", required: true, label: "組織名", placeholder: "株式会社セールス" },
  { key: "tenantSlug", type: "string", required: true, label: "URL スラグ", placeholder: "sales-corp", pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$" },
  { key: "ownerEmail", type: "email", required: true, label: "管理者メール" },
  { key: "brandTone", type: "select", required: false, label: "ブランドトーン", default: "professional", enum: ["modern", "minimal", "luxury", "friendly", "professional", "playful"] },
  { key: "initialDealStages", type: "array", required: false, label: "初期案件ステージ", itemSchema: "DealStageDefinition" },
  { key: "initialContactStatuses", type: "array", required: false, label: "連絡先ステータス", default: ["lead", "prospect", "active", "inactive"], enum: ["lead", "prospect", "active", "inactive", "churned"] },
];

// ─── reservation_saas ───

const serviceCategorySchema = z.object({
  name: z.string().min(1),
  slug: slugField,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const rsvGenerationInputsSchema = z.object({
  // Required
  tenantName: z.string().min(1, "店舗名は必須です"),
  tenantSlug: slugField,
  ownerEmail: emailField,

  // Optional
  brandTone: z
    .enum(["modern", "minimal", "luxury", "friendly", "professional", "playful"])
    .default("professional"),
  initialServiceCategories: z.array(serviceCategorySchema).default([]),
  defaultSlotDurationMinutes: z.number().int().min(5).max(480).default(60),
});

export type RsvGenerationInputs = z.infer<typeof rsvGenerationInputsSchema>;

const rsvFields: FieldDescriptor[] = [
  { key: "tenantName", type: "string", required: true, label: "店舗名", placeholder: "Beauty Salon ABC" },
  { key: "tenantSlug", type: "string", required: true, label: "URL スラグ", placeholder: "salon-abc", pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$" },
  { key: "ownerEmail", type: "email", required: true, label: "オーナーメール" },
  { key: "brandTone", type: "select", required: false, label: "ブランドトーン", default: "professional", enum: ["modern", "minimal", "luxury", "friendly", "professional", "playful"] },
  { key: "initialServiceCategories", type: "array", required: false, label: "初期サービスカテゴリ", itemSchema: "ServiceCategoryDefinition" },
  { key: "defaultSlotDurationMinutes", type: "string", required: false, label: "デフォルト枠(分)", default: 60 },
];

// ─── Registry ───

/**
 * Generation inputs registry — schema + field descriptors per template.
 * Adding a new template: define schema + fields above, add entry here.
 */
export const GENERATION_INPUTS_REGISTRY: Record<string, GenerationInputsEntry> = {
  community_membership_saas: {
    schema: cmsGenerationInputsSchema,
    fields: cmsFields,
  },
  internal_admin_ops_saas: {
    schema: iaoGenerationInputsSchema,
    fields: iaoFields,
  },
  simple_crm_saas: {
    schema: crmGenerationInputsSchema,
    fields: crmFields,
  },
  reservation_saas: {
    schema: rsvGenerationInputsSchema,
    fields: rsvFields,
  },
};

/**
 * Validate generation inputs for a template.
 * Returns { success: true, data } or { success: false, errors }.
 */
export function validateGenerationInputs(
  templateKey: string,
  inputs: unknown
): { success: true; data: unknown } | { success: false; errors: z.ZodIssue[] } {
  const entry = GENERATION_INPUTS_REGISTRY[templateKey];
  if (!entry) {
    // No schema defined → pass through (backward compat for templates without schemas)
    return { success: true, data: inputs };
  }

  const result = entry.schema.safeParse(inputs);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues };
}

/**
 * Get field descriptors for UI form generation.
 * Returns null if no schema is registered for this template.
 * No template-specific branching — resolved from registry.
 */
export function getGenerationInputsJsonSchema(
  templateKey: string
): { templateKey: string; fields: FieldDescriptor[] } | null {
  const entry = GENERATION_INPUTS_REGISTRY[templateKey];
  if (!entry) return null;
  return { templateKey, fields: entry.fields };
}
