import { z } from "zod";

/**
 * KB教訓: llm_api_unbounded_text_input
 * (~/Documents/my-vault/30_Knowledge/errors/llm_api_unbounded_text_input.md)
 *
 * 「LLM 呼び出し API の Zod スキーマにテキスト長の上限がなく、巨大テキストが
 * 無制限に LLM へ送信される」という既知パターンへの対策。saas-builder 本体の
 * /api/documents/diff (lib/validation/document-analysis.ts) と同じ
 * 100,000 文字上限を踏襲する。
 */
export const MAX_DIFF_TEXT_LENGTH = 100_000;

export const DiffAnalysisRequestSchema = z.object({
  tenantId: z.string().min(1, "tenantId is required"),
  sourceId: z.string().min(1, "sourceId is required"),
  sourceUrl: z.string().url(),
  previousText: z
    .string()
    .max(MAX_DIFF_TEXT_LENGTH, `previousText is too large (max ${MAX_DIFF_TEXT_LENGTH} chars)`)
    .nullable(),
  currentText: z
    .string()
    .min(1, "currentText is required")
    .max(MAX_DIFF_TEXT_LENGTH, `currentText is too large (max ${MAX_DIFF_TEXT_LENGTH} chars)`),
});
export type DiffAnalysisRequest = z.infer<typeof DiffAnalysisRequestSchema>;

/**
 * MVP スコープ (助成金検知) の構造化抽出結果。
 * Claude の structured outputs (output_config.format) は minLength/maxLength/
 * minimum/maximum 等の制約に未対応のため、形状の強制は JSON Schema
 * (analyzer/output-schema.ts) 側、業務制約（文字数上限・締切日フォーマット等）の
 * 検証はこの Zod スキーマ側で分担する。
 */
export const SubsidyExtractionSchema = z.object({
  isRelevant: z.boolean(),
  subsidyName: z.string().max(200).nullable(),
  targetIndustries: z.array(z.string().max(100)).max(50),
  amount: z.object({
    min: z.number().nonnegative().nullable(),
    max: z.number().nonnegative().nullable(),
    unit: z.literal("JPY"),
    description: z.string().max(300).nullable(),
  }),
  applicationDeadline: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be ISO 8601 (YYYY-MM-DD)")
      .nullable(),
    description: z.string().max(200).nullable(),
  }),
  summary: z.string().max(1000),
  sourceUrl: z.string().url(),
  confidence: z.enum(["high", "medium", "low"]),
});
export type SubsidyExtraction = z.infer<typeof SubsidyExtractionSchema>;
