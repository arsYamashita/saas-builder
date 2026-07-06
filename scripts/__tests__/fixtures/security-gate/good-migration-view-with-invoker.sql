-- Correct pattern: same VIEW as the bad fixture, but with
-- security_invoker = true so RLS is evaluated as the CALLER, not the
-- view owner. Should NOT trigger any violation.
CREATE VIEW public.contents_published AS
  SELECT id, tenant_id, title, body
  FROM public.contents
  WHERE published = true;

ALTER VIEW public.contents_published SET (security_invoker = true);
