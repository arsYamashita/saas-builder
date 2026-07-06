-- Correct multi-view pattern: EVERY view is covered — one inline via
-- WITH (security_invoker = true), one via a follow-up ALTER VIEW.
-- Should NOT trigger any violation.
CREATE VIEW public.contents_published
  WITH (security_invoker = true) AS
  SELECT id, tenant_id, title, body
  FROM public.contents
  WHERE published = true;

CREATE OR REPLACE VIEW contents_drafts AS
  SELECT id, tenant_id, title, body
  FROM public.contents
  WHERE published = false;

ALTER VIEW public.contents_drafts SET (security_invoker = true);
