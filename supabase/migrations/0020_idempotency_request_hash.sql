-- ============================================================================
-- Migration 0020: idempotency_keys.request_hash
--
-- Instruction: 2026-11-03_190_saas_builder_idempotency_request_hash_mismatch_422.md
--
-- withRoute (packages/idempotency) used to replay a stored response for any
-- repeat of the same (scope, key), without looking at the request content.
-- A retry whose body had changed (user fixed the input after a dropped
-- connection) silently got the OLD response. withRoute now stores a sha256
-- of [namespace, pathname, sorted query, body] on the claimed row and answers
-- 422 idempotency_mismatch when the same key arrives with a different hash.
--
-- Rows that exist before this migration keep request_hash = NULL. The store
-- returns NULL as-is and withRoute treats NULL as "not equal to any request
-- hash" (fail-closed): a legacy row can only be replayed by a client that
-- uses a fresh key, never by a request whose content cannot be proven equal.
--
-- NOT applied anywhere by this change: the file is added for the next
-- environment that is provisioned.
-- ============================================================================

alter table idempotency_keys
  add column if not exists request_hash text;

comment on column idempotency_keys.request_hash is
  'sha256 hex of canonical JSON [namespace, pathname, sorted query, body] the key was first used with. NULL on rows written before migration 0020; NULL never matches a request hash (fail-closed, answered as 422 idempotency_mismatch).';
