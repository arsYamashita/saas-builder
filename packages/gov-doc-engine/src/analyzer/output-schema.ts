/**
 * Claude の structured outputs (output_config.format = json_schema) 用の JSON Schema。
 *
 * SubsidyExtractionSchema (Zod, ./schema.ts) と手動で形状を対応させている。
 * structured outputs は minLength/maxLength/minimum/maximum 等の制約に未対応なため、
 * ここでは「形状」だけを強制し、文字数上限・数値制約などの業務ルールは
 * レスポンス受信後に SubsidyExtractionSchema.safeParse() で検証する
 * （責務分離: JSON Schema = 形状、Zod = 業務制約）。
 */
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] } as const;

export const SUBSIDY_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    isRelevant: { type: "boolean" },
    subsidyName: nullableString,
    targetIndustries: { type: "array", items: { type: "string" } },
    amount: {
      type: "object",
      properties: {
        min: nullableNumber,
        max: nullableNumber,
        unit: { type: "string", enum: ["JPY"] },
        description: nullableString,
      },
      required: ["min", "max", "unit", "description"],
      additionalProperties: false,
    },
    applicationDeadline: {
      type: "object",
      properties: {
        date: nullableString,
        description: nullableString,
      },
      required: ["date", "description"],
      additionalProperties: false,
    },
    summary: { type: "string" },
    sourceUrl: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: [
    "isRelevant",
    "subsidyName",
    "targetIndustries",
    "amount",
    "applicationDeadline",
    "summary",
    "sourceUrl",
    "confidence",
  ],
  additionalProperties: false,
} as const;
