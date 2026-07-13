/**
 * Zod schemas for Document Analysis API inputs/outputs.
 */

import { z } from "zod";
import {
  MAX_LLM_INPUT_CHARS,
  MAX_LLM_INPUT_BASE64_BYTES,
  MAX_LOCAL_DIFF_INPUT_CHARS,
} from "./llm-input-limits";

// ── Parse API ───────────────────────────────────────────────

/** Request body for /api/documents/parse (multipart/form-data with "file" field) */
export const parseRequestSchema = z.object({
  /** Base64-encoded PDF content (alternative to file upload) */
  base64: z
    .string()
    .min(1, "base64 content is required")
    .max(
      MAX_LLM_INPUT_BASE64_BYTES,
      `base64 content too large (max ${MAX_LLM_INPUT_BASE64_BYTES} chars, ~20MB file)`
    ),
  /** Optional filename for metadata */
  filename: z.string().optional(),
});

export const parsedSectionSchema = z.object({
  heading: z.string(),
  body: z.string(),
  startPage: z.number().int().min(1),
});

export const documentMetadataSchema = z.object({
  pageCount: z.number().int().min(0),
  charCount: z.number().int().min(0),
  title: z.string().nullable(),
  author: z.string().nullable(),
  subject: z.string().nullable(),
  creator: z.string().nullable(),
  creationDate: z.string().nullable(),
});

export const parseResponseSchema = z.object({
  fullText: z.string(),
  sections: z.array(parsedSectionSchema),
  metadata: documentMetadataSchema,
});

// ── Diff API ────────────────────────────────────────────────

export const diffRequestSchema = z
  .object({
    // Always-applied cap is the generous local-diff safety limit (basic DoS
    // guard, no LLM involved). When the request will reach Claude
    // (localOnly !== true), superRefine below additionally enforces the
    // tighter MAX_LLM_INPUT_CHARS cost-governance cap.
    // See KB: llm_api_unbounded_text_input; Codex review 指示書043 P2
    // (local-only diffs must not be blocked by the LLM-specific limit).
    oldText: z
      .string()
      .min(1, "oldText is required")
      .max(MAX_LOCAL_DIFF_INPUT_CHARS, `oldText is too large (max ${MAX_LOCAL_DIFF_INPUT_CHARS} chars)`),
    newText: z
      .string()
      .min(1, "newText is required")
      .max(MAX_LOCAL_DIFF_INPUT_CHARS, `newText is too large (max ${MAX_LOCAL_DIFF_INPUT_CHARS} chars)`),
    oldLabel: z.string().optional(),
    newLabel: z.string().optional(),
    domain: z.string().optional(),
    language: z.string().optional(),
    /** If true, use local diff only (no LLM call) */
    localOnly: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.localOnly) return; // local-only path never reaches Claude

    if (data.oldText.length > MAX_LLM_INPUT_CHARS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["oldText"],
        message: `oldText is too large for the LLM diff (max ${MAX_LLM_INPUT_CHARS} chars). Use localOnly=true for larger local-only diffs.`,
      });
    }
    if (data.newText.length > MAX_LLM_INPUT_CHARS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newText"],
        message: `newText is too large for the LLM diff (max ${MAX_LLM_INPUT_CHARS} chars). Use localOnly=true for larger local-only diffs.`,
      });
    }
  });

export const documentChangeSchema = z.object({
  type: z.enum(["added", "removed", "modified", "moved"]),
  location: z.string(),
  summary: z.string(),
  impact: z.enum(["high", "medium", "low"]),
  oldSnippet: z.string().optional(),
  newSnippet: z.string().optional(),
});

export const diffResponseSchema = z.object({
  summary: z.string(),
  changeCount: z.number().int().min(0),
  changes: z.array(documentChangeSchema),
  keyTakeaways: z.array(z.string()),
  domainNotes: z.string().optional(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
  }).optional(),
});

export const localDiffResponseSchema = z.object({
  addedLines: z.number().int().min(0),
  removedLines: z.number().int().min(0),
  unchangedLines: z.number().int().min(0),
  changeRatio: z.number().min(0).max(1),
});

// ── Type exports ────────────────────────────────────────────

export type ParseRequest = z.infer<typeof parseRequestSchema>;
export type ParseResponse = z.infer<typeof parseResponseSchema>;
export type DiffRequest = z.infer<typeof diffRequestSchema>;
export type DiffResponse = z.infer<typeof diffResponseSchema>;
export type LocalDiffResponse = z.infer<typeof localDiffResponseSchema>;
