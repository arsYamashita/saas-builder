## Summary

<!-- What does this PR do and why? -->

## Error KB Checklist

Run `npm run kb:checklist` before opening this PR (regenerates
[`docs/error-kb-checklist.md`](../docs/error-kb-checklist.md) from
`30_Knowledge/errors/`). Check off the categories below that apply to this
change, then open the generated file for the specific items.

- [ ] **Stripe / Payments** touched (webhook route, checkout/portal route,
      any `stripe.*.create()` call, subscriptions/purchases/commissions
      tables) — reviewed `docs/error-kb-checklist.md#stripe--payments`
- [ ] **Supabase / RLS** touched (new table, new migration, storage
      bucket) — reviewed `docs/error-kb-checklist.md#supabase--rls`, and
      the new/changed table has RLS enabled with a real policy (see
      `docs/db/rls-migration-template.sql`)
- [ ] **Idempotency / race conditions** relevant (new webhook consumer,
      cron job, or any insert triggered by an at-least-once event source)
      — reviewed `docs/error-kb-checklist.md#idempotency--race-conditions`
- [ ] **Rate limit / env validation** relevant (new public API route, new
      required env var) — reviewed
      `docs/error-kb-checklist.md#rate-limit--env-validation`
- [ ] None of the above apply to this change

## Resolves-KB

<!--
If this PR actually fixes an error pattern tracked in the vault's
30_Knowledge/errors/, add one `Resolves-KB:` line per file below (do not
just tick the checklist above — this is what `npm run kb:reconcile`
scans for after merge to flip `resolved: true` in the vault
automatically, so the pattern stops resurfacing in future KB checklists
/ M2 instructions). Leave this section empty if not applicable.

Format: `Resolves-KB: <error-file>.md` (one per line; the .md suffix is
optional). Example:

Resolves-KB: stripe_checkout_idempotency_key_missing.md
-->

## Test Plan

- [ ] `npm run test:unit` passes
- [ ] `npm run build` passes
- [ ] New/changed behavior has a test
