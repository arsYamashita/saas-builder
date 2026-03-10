/**
 * Rule-based project draft builder.
 *
 * Takes intake answers + current form + recommendations
 * and returns a partial form patch that fills empty fields only.
 * Does NOT auto-submit or force overwrite user-entered values.
 */

import type { IntakeAnswers } from "./project-intake-questions";
import { intakeToFormHints } from "./project-intake-questions";
import type { TemplateRecommendation } from "@/lib/templates/template-recommendation";

export interface DraftPatch {
  /** Fields to merge into form state (empty-field-only) */
  values: Record<string, unknown>;
  /** Which fields were actually filled by this draft */
  filledFields: string[];
  /** Suggested templateKey from recommendation (may or may not be applied) */
  suggestedTemplate: string | null;
}

/**
 * Build a draft patch from intake answers and recommendations.
 *
 * Policy:
 * - Only fill fields that are currently empty/default in the form
 * - Use intake hints as the primary source
 * - Use recommendation 1st place to suggest templateKey
 * - Return metadata about what was filled so the UI can show feedback
 */
export function buildProjectDraft(
  intake: IntakeAnswers,
  currentForm: Record<string, unknown>,
  recommendations: TemplateRecommendation[]
): DraftPatch {
  const hints = intakeToFormHints(intake);
  const values: Record<string, unknown> = {};
  const filledFields: string[] = [];

  // Fields that the draft may fill
  const draftableFields = [
    "summary",
    "problemToSolve",
    "targetUsers",
    "managedData",
    "requiredFeatures",
    "billingModel",
    "affiliateEnabled",
  ];

  for (const field of draftableFields) {
    const hintValue = hints[field];
    if (hintValue === undefined || hintValue === null) continue;

    const currentValue = currentForm[field];

    // Skip if user has already entered a meaningful value
    if (isNonEmpty(currentValue)) continue;

    values[field] = hintValue;
    filledFields.push(field);
  }

  // Suggest templateKey from recommendation 1st place
  const suggestedTemplate =
    recommendations.length > 0 ? recommendations[0].templateKey : null;

  // Apply suggested template if user hasn't picked one different from default
  if (
    suggestedTemplate &&
    (currentForm.templateKey === "membership_content_affiliate" ||
      currentForm.templateKey === "")
  ) {
    values.templateKey = suggestedTemplate;
    filledFields.push("templateKey");
  }

  return { values, filledFields, suggestedTemplate };
}

/** Human-readable labels for draftable fields */
const FIELD_LABELS: Record<string, string> = {
  summary: "サービス概要",
  problemToSolve: "解決したい課題",
  targetUsers: "ターゲットユーザー",
  managedData: "管理データ",
  requiredFeatures: "必要な機能",
  billingModel: "課金方式",
  affiliateEnabled: "アフィリエイト",
  templateKey: "テンプレート",
};

export interface DraftPreview {
  /** Fields that will be filled, with labels */
  fields: { key: string; label: string }[];
  /** Suggested template label (from catalog) or null */
  suggestedTemplateLabel: string | null;
  /** Whether anything will change */
  hasChanges: boolean;
}

/**
 * Preview what buildProjectDraft would do, without applying.
 * Reuses the same logic to compute filledFields.
 */
export function previewDraft(
  draft: DraftPatch,
  getTemplateLabel?: (key: string) => string | undefined
): DraftPreview {
  const fields = draft.filledFields.map((key) => ({
    key,
    label: FIELD_LABELS[key] ?? key,
  }));

  const suggestedTemplateLabel =
    draft.suggestedTemplate && getTemplateLabel
      ? getTemplateLabel(draft.suggestedTemplate) ?? draft.suggestedTemplate
      : draft.suggestedTemplate;

  return {
    fields,
    suggestedTemplateLabel,
    hasChanges: draft.filledFields.length > 0,
  };
}

function isNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value; // false = not filled
  return false;
}
