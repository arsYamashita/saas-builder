/**
 * Zod schema for POST /api/projects/rewrite-brief.
 *
 * The route forwards summary/problemToSolve/targetUsers verbatim into an
 * LLM prompt (see lib/utils/read-prompt "utility/rewrite-project-brief.md").
 * Previously this route parsed the JSON body with no schema at all, so any
 * of these fields could carry unbounded text straight into the prompt.
 * See KB: llm_api_unbounded_text_input.
 */
import { z } from "zod";
import { MAX_LLM_BRIEF_FIELD_CHARS } from "./llm-input-limits";

export const rewriteBriefRequestSchema = z.object({
  summary: z
    .string()
    .max(MAX_LLM_BRIEF_FIELD_CHARS, `summary is too large (max ${MAX_LLM_BRIEF_FIELD_CHARS} chars)`)
    .optional(),
  problemToSolve: z
    .string()
    .max(MAX_LLM_BRIEF_FIELD_CHARS, `problemToSolve is too large (max ${MAX_LLM_BRIEF_FIELD_CHARS} chars)`)
    .optional(),
  targetUsers: z
    .string()
    .max(MAX_LLM_BRIEF_FIELD_CHARS, `targetUsers is too large (max ${MAX_LLM_BRIEF_FIELD_CHARS} chars)`)
    .optional(),
});

export type RewriteBriefRequest = z.infer<typeof rewriteBriefRequestSchema>;
