-- Intentional fixture violation (Codex review PR #36 P2 regression case):
-- the ONLY place "security_invoker = true" appears is inside comments.
-- The old file-level substring check passed this file; the comment-aware
-- per-view check must flag contents_published.

/* NOTE: remember to run
     ALTER VIEW public.contents_published SET (security_invoker = true);
   in a follow-up migration (never actually done). */
CREATE VIEW public.contents_published AS
  SELECT id, tenant_id, title, body
  FROM public.contents
  WHERE published = true;
-- TODO: security_invoker = true
