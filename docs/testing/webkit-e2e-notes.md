# WebKit (Safari) E2E lane — notes

Added as part of M2 instruction `2026-07-04_021` (WebKit E2E verification lane).
`playwright.config.ts` now has two additional projects, `webkit` and
`logged-in-webkit`, mirroring `chromium` / `logged-in` 1:1 so the same spec
files run under both engines with no duplication.

```bash
npx playwright install webkit   # one-time, ~73MB
npx playwright test --project=webkit             # public/unauthenticated specs
npx playwright test --project=logged-in-webkit   # *.auth.spec.ts (self-skips
                                                  # without TEST_USER_EMAIL/
                                                  # TEST_USER_PASSWORD, same as
                                                  # "logged-in" already does)
```

## Result summary (full suite, all 5 projects, sandbox run 2026-07-06)

- `setup`: 1 passed (auth setup gracefully no-ops without test creds)
- `chromium`: 47 passed
- `logged-in`: 25 skipped (no `TEST_USER_EMAIL` in this sandbox — expected,
  matches CI's documented behavior when the secret is unset)
- `webkit`: 46 passed, **0 failed**
- `logged-in-webkit`: 25 skipped (same reason as `logged-in`)

No test needed a fix or an environment-driven skip beyond what already existed
(the pre-existing `test.skip` guards in every `*.auth.spec.ts` file). No
WebKit-specific product bug was found — see the KB note below for how that was
confirmed rather than assumed.

Caveat: this sandbox has no real Supabase project or `TEST_USER_EMAIL`/
`TEST_USER_PASSWORD`, so `logged-in` / `logged-in-webkit` have never actually
exercised authenticated pages here, in either engine — only the redirect and
public-page specs (46-47 of them) got real assertions. CI *does* have those
secrets (see `.github/workflows/ci.yml`), so once a `playwright-webkit` CI job
is wired up (not added in this branch — see "Not done" below) it will be the
first real signal on authenticated WebKit behavior (dashboard/content/plans
CRUD flows).

## Cookie / SameSite / ITP / redirect / localStorage — investigated differences

Investigated by reading the cookie-setting code paths and empirically probing
them with both engines via Playwright (`context.cookies()`,
`document.cookie`, and `localStorage`) against the local dev server — not just
by reasoning about Safari's ITP docs in the abstract.

1. **Auth session cookies avoid the classic Safari ITP footgun already.**
   `lib/db/supabase/client.ts` / `lib/db/supabase/server.ts` use
   `@supabase/ssr`'s `createBrowserClient` / `createServerClient`, and
   `/api/auth/login` (`app/api/auth/login/route.ts`) performs the actual
   `signInWithPassword` call **server-side**, inside a Route Handler, so the
   session cookie is set via an HTTP `Set-Cookie` response header returned
   from a same-origin `fetch()` POST — not via `document.cookie` in client
   JS. This matters because Safari's ITP caps the lifetime of cookies set
   through script-accessible APIs (`document.cookie`) to 7 days regardless of
   the requested `Max-Age`, but does **not** apply that cap to `Set-Cookie`
   headers on ordinary first-party HTTP responses. Apps that instead call
   `supabase.auth.signInWithPassword` directly from the browser (writing the
   session via `document.cookie`) are the ones that hit "logged out after ~7
   days in Safari, works fine in Chrome" — this app's architecture already
   sidesteps that. Confirmed empirically: probed the equivalent mechanism
   (same-origin `fetch()` to a cookie-setting route, `/a/[code]`, without a
   full navigation) in both engines — cookie set via fetch()'s Set-Cookie
   response header round-trips identically in Chromium and WebKit.

2. **First-party redirect + Set-Cookie (`/a/[code]/route.ts`, the affiliate
   link handler) behaves identically in both engines.** This route issues a
   302 redirect (`/a/:code` → `/signup`) with two `Set-Cookie` headers
   (`affiliate_code`, `httpOnly:false`; `visitor_token`, `httpOnly:true`;
   both `sameSite:"lax"`, `maxAge` 30 days). Probed both engines end to end
   (`playwright` launched against the dev server): final URL, cookie
   `httpOnly`/`sameSite`/`secure`/`expires`, `document.cookie` visibility, and
   the redirect all matched exactly — WebKit did **not** truncate the 30-day
   `Max-Age` to a shorter ITP-capped value. This is expected because ITP's
   redirect-based mitigations specifically target **cross-site "bounce
   tracking"** (domain A → domain B → domain C to plant a cross-site
   identifier); this redirect is same-site (`/a/:code` → `/signup` on the
   same origin), which is outside that mitigation's scope. Kept as a
   regression check to revisit if the affiliate flow is ever changed to
   redirect through a third-party domain.

3. **`localStorage` works identically in both engines at `localhost`.**
   Verified a `setItem`/`getItem` round trip in both. The app itself doesn't
   use `localStorage`/`sessionStorage` anywhere in `app/`, `components/`, or
   `lib/` (grepped — zero hits); the only localStorage-adjacent behavior in
   the stack is internal to `@supabase/ssr`, which is cookie-based by design
   (see #1), so there's no first-party dependency on localStorage that
   Safari's stricter private-browsing storage eviction / ITP partitioning
   could break.

4. **Not currently exercised, flagged for the future:** this app has no
   cross-site iframe / embeddable-widget feature today (grepped for
   `iframe`/`embed`/`widget` — no UI surface, only an unrelated string match
   in `app/api/billing/checkout/route.ts`). If one is ever added (e.g. an
   embeddable widget that needs the tenant's auth/session inside a
   third-party page), Safari's default third-party-cookie blocking (which
   Chromium does *not* enforce today, though it has similar plans) will
   silently break it unless the design uses a token-in-URL /
   `postMessage`-bridge / partitioned-cookie (CHIPS) approach from day one.
   This is a design-time consideration, not a bug to fix now.

5. **`secure` cookie flag is `NODE_ENV === "production"`-gated
   (`app/a/[code]/route.ts`), so it's `false` in dev/test** — not exercised
   as `true` over plain HTTP in this lane. No differences expected in
   production (both engines require HTTPS to honor `Secure` cookies there),
   but this combination (secure cookies + `next start` locally without TLS)
   hasn't been probed here; not in scope for this instruction.

## Safari MCP server (official WebKit MCP) — 30-minute evaluation

Time-boxed per the instruction; see
`~/Documents/my-vault/30_Knowledge/references/safari_mcp_setup.md` for the
outcome (evaluated, not adopted for this lane — Playwright's `webkit` project
already gives deterministic, CI-friendly WebKit coverage without an
additional moving part).

## Not done in this branch (explicitly out of scope / deferred)

- No new CI job added to `.github/workflows/ci.yml` for the webkit lane.
  Two other branches are concurrently touching shared files
  (`packages/*` additions per the instruction's constraint), so this branch
  intentionally limits shared-file changes to `playwright.config.ts` plus
  this new doc. Wiring `--project=webkit` (and `logged-in-webkit`) into CI as
  a `playwright-webkit` job (same shape as the existing `playwright` job) is
  a small, low-risk follow-up once the parallel branches land.
- Real authenticated-WebKit verification against a live Supabase project
  (see caveat above).
