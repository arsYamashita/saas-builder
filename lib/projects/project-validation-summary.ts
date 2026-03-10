/**
 * Lightweight pre-submit validation summary.
 * Does NOT replace Zod validation — this is a UI helper
 * to show missing/empty important fields before submit.
 */

export interface MissingItem {
  key: string;
  label: string;
  message: string;
}

export interface ValidationSummary {
  missingItems: MissingItem[];
  isReady: boolean;
}

interface FieldCheck {
  key: string;
  label: string;
  required: boolean;
  message: string;
  check: (form: Record<string, unknown>) => boolean;
}

const CHECKS: FieldCheck[] = [
  {
    key: "name",
    label: "サービス名",
    required: true,
    message: "サービス名を入力してください",
    check: (f) => isNonEmptyString(f.name),
  },
  {
    key: "templateKey",
    label: "テンプレート",
    required: true,
    message: "テンプレートを選択してください",
    check: (f) => isNonEmptyString(f.templateKey),
  },
  {
    key: "summary",
    label: "サービス概要",
    required: false,
    message: "サービス概要があると生成精度が上がります",
    check: (f) => isNonEmptyString(f.summary),
  },
  {
    key: "targetUsers",
    label: "ターゲットユーザー",
    required: false,
    message: "ターゲットユーザーの入力を推奨します",
    check: (f) => isNonEmptyString(f.targetUsers),
  },
  {
    key: "requiredFeatures",
    label: "必要な機能",
    required: false,
    message: "機能が未選択です",
    check: (f) => isNonEmptyArray(f.requiredFeatures),
  },
  {
    key: "managedData",
    label: "管理データ",
    required: false,
    message: "管理データが未選択です",
    check: (f) => isNonEmptyArray(f.managedData),
  },
];

export function buildValidationSummary(
  form: Record<string, unknown>
): ValidationSummary {
  const missingItems: MissingItem[] = [];

  for (const c of CHECKS) {
    if (!c.check(form)) {
      missingItems.push({ key: c.key, label: c.label, message: c.message });
    }
  }

  const hasRequiredMissing = CHECKS.some(
    (c) => c.required && !c.check(form)
  );

  return {
    missingItems,
    isReady: !hasRequiredMissing,
  };
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function isNonEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}
