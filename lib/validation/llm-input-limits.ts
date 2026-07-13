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

/**
 * Cap for short label/metadata fields (e.g. version labels, domain names)
 * that get interpolated into an LLM prompt alongside the main text body.
 * Without this, a caller can keep oldText/newText within limits while
 * smuggling megabytes into a "label" field instead.
 */
export const MAX_LLM_LABEL_FIELD_CHARS = 200;

/**
 * Cap for individual entries in a string array field (e.g. feature/data
 * labels) that gets embedded into a prompt. Array fields also need a count
 * cap (MAX_LLM_ARRAY_ITEMS) — without both, N items x per-item max still
 * lets a single request smuggle megabytes of aggregate text into the LLM
 * call. See KB: llm_api_unbounded_text_input.
 */
export const MAX_LLM_ARRAY_ITEM_CHARS = 200;

/** Cap on the number of entries in a string array field feeding an LLM prompt. */
export const MAX_LLM_ARRAY_ITEMS = 30;

/**
 * Cap for base64-encoded file payloads, sized to the exact base64 expansion
 * of a 20MB source file (base64 encodes 3 bytes as 4 chars, rounded up to
 * the next 4-char block): ceil(20MiB / 3) * 4 = 27,962,028 chars.
 *
 * This must match — not just approximate — the route's post-decode 20MB
 * check (app/api/documents/parse/route.ts). A looser round-number cap (e.g.
 * 28 * 1024 * 1024) lets a several-MB-oversized base64 string pass Zod,
 * still get fully allocated by `Buffer.from()`, and only be rejected after
 * that allocation — defeating the point of validating before decode.
 * Codex review 指示書043 P2.
 */
export const MAX_LLM_INPUT_BASE64_BYTES = Math.ceil((20 * 1024 * 1024) / 3) * 4;

/**
 * Generous safety cap for the local-only diff path (compareDocumentsLocal),
 * which never calls the LLM. This is NOT a cost-governance cap — it's a
 * basic DoS guard against pathological in-memory diffs — so it is much
 * larger than MAX_LLM_INPUT_CHARS. Applied regardless of localOnly so the
 * field always has *some* upper bound; the tighter MAX_LLM_INPUT_CHARS is
 * applied additionally whenever the request will reach Claude.
 */
export const MAX_LOCAL_DIFF_INPUT_CHARS = 2_000_000;
