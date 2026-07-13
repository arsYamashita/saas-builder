/**
 * Centralized upper bounds for user-supplied text that eventually flows into
 * a paid LLM (Claude) API call.
 *
 * Without a cap, a single request can carry megabytes of text straight into
 * the prompt, causing token-cost blowups and request timeouts. This module
 * is the single source of truth for those limits so they don't drift across
 * schemas.
 *
 * See KB: llm_api_unbounded_text_input (30_Knowledge/errors/).
 */

/** Generic cap for free-form text blocks sent to an LLM (e.g. document diff bodies). */
export const MAX_LLM_INPUT_CHARS = 100_000;

/** Smaller cap for short structured brief/form fields that get embedded into a prompt. */
export const MAX_LLM_BRIEF_FIELD_CHARS = 10_000;

/** Cap for base64-encoded file payloads (~20MB source file, base64-inflated). */
export const MAX_LLM_INPUT_BASE64_BYTES = 28 * 1024 * 1024;
