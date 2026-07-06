-- Intentional fixture violation: a VIEW with no security_invoker setting.
-- Even though contents has RLS, this view runs with the view OWNER's
-- privileges and bypasses it for every caller. Should trigger
-- `no-view-without-security-invoker`.
CREATE VIEW public.contents_published AS
  SELECT id, tenant_id, title, body
  FROM public.contents
  WHERE published = true;
