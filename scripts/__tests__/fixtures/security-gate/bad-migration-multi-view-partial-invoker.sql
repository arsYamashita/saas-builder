-- Intentional fixture violation (Codex review PR #36 P2 regression case):
-- TWO views in one migration, but only the FIRST gets security_invoker.
-- The old file-level check saw "security_invoker = true" somewhere in the
-- file and passed the whole migration; the per-view check must flag
-- contents_drafts.
CREATE VIEW public.contents_published AS
  SELECT id, tenant_id, title, body
  FROM public.contents
  WHERE published = true;

ALTER VIEW public.contents_published SET (security_invoker = true);

CREATE VIEW public.contents_drafts AS
  SELECT id, tenant_id, title, body
  FROM public.contents
  WHERE published = false;
