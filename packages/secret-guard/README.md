# @saas/secret-guard

Two-layer defense against secrets leaking out of this monorepo (and any repo
that adopts this package):

1. **Repo history layer** — `ci/gitleaks.toml` + `ci/github-actions-secret-guard.yml`
   (a reusable PR-gate template) + `ci/pre-commit` (local, fast feedback —
   the filename must be exactly `pre-commit`: after
   `git config core.hooksPath packages/secret-guard/ci`, Git looks up hooks
   in that directory *by hook name*, so any other filename never fires).
   Scans what's *committed*.
2. **Runtime layer** — a `mask()` API (TypeScript in `src/`, Dart in
   `dart/`) that sanitizes secret-shaped substrings out of any string
   *before it leaves the process* — a log line, an HTTP response body, a
   thrown error's `.message`, an outbound request URL, a generated file on
   disk. This is the layer that catches the case gitleaks structurally
   can't: a secret that was never committed, but ended up embedded inside
   a downstream SDK's error message (Stripe/Supabase/Gemini all do this)
   and then got logged or echoed back to a client.

Neither layer is a substitute for the other. gitleaks can't stop a runtime
leak (the secret is never in a diff); `mask()` can't stop a secret from
being committed in the first place.

## Why `registerSink()` instead of just exporting `mask()`

A bare `mask(str)` function is easy to *call once* at one integration
point and then forget to call anywhere else a new output route shows up six
months later — the exact shape of the
`gemini_api_key_url_query_masker_bypass` regression (aeo-service, commit
b2acc6e): the masker existed and worked, but a new leak path (a key riding
a URL query string, not a header) wasn't one of the cases anyone had wired
it into.

So this package inverts the ergonomics: **enumerate every output-route
*kind* up front, then require an explicit registration per concrete call
site, then ship a test that fails if a whole kind has zero registrations.**

```ts
import { registerSink } from "@saas/secret-guard";

// Once, at the real call site:
const maskForLog = registerSink({ kind: "log", name: "lib/api/errors.ts console.error" });

console.error(`[${context}] errorId=${errorId}:`, maskForLog(causeMessage));
```

The five kinds are fixed (`ALL_SINK_KINDS` in `src/sinks.ts` /
`lib/sinks.dart`):

| kind | what it covers |
|---|---|
| `log` | `console.error`/`console.log`/structured logger output |
| `http_response` | JSON/text bodies returned to an API client |
| `error_message` | a caught `Error`'s `.message` (before it's read anywhere) |
| `url_query` | outbound request URLs (query params, not just headers) |
| `artifact_file` | generated files written to disk (reports, exports, debug dumps) |

`assertAllKindsRegistered()` throws listing every kind with **zero**
registered sinks. Run it as its own test in every consumer's test suite —
see `src/__tests__/wiring.test.ts` / `dart/test/wiring_test.dart` for the
canonical version, which also flows a battery of known secret shapes
through every registered sink and asserts zero plaintext survives (the
"配線テスト": wiring test).

This does **not** catch "a call site exists but was wired to the wrong
masking function" or "a call site was added but never registered at all"
(only "an entire *kind* has nothing"). That's a real gap — the trade-off is
the same one every registration-based DI/coverage check makes: cheap to
verify, not exhaustive. gitleaks (layer 1) is the backstop for anything
that slips through here and gets committed anyway.

## Real integration: saas-builder's `lib/api/errors.ts`

`serverErrorResponse()` (used by 17 API routes under `app/api/`) already
never forwards a raw `error.message` to the client — but it does
`console.error` the cause message server-side, unmasked, before this
change. That's a `log`-kind sink: if a downstream Stripe/Supabase/Gemini
call throws an error whose message embeds a key (the exact
`gemini_api_key_url_query_masker_bypass` shape), it used to land in server
logs verbatim. It's now wired through `registerSink({ kind: "log", ... })`
— see `lib/api/errors.ts` and the added case in
`lib/api/__tests__/errors.test.ts`.

## Patterns covered (`src/patterns.ts` / `lib/src/patterns.dart`)

- `sk-`/`sk-ant-`-prefixed keys (OpenAI/Anthropic)
- Stripe secret/restricted keys (`sk_live_`/`sk_test_`/`rk_live_`/`rk_test_`
  — **not** `pk_*`, which is meant to ship to the browser)
- Google `AIza...` API keys (39 chars, not hex — the hex32+ rule below
  would miss it)
- bare `key=<secret>` in a URL query string — the exact
  `gemini_api_key_url_query_masker_bypass` shape (a query param, not a
  header, so it survives into exception-message stringification)
- `Bearer <token>` headers
- generic `api_key=`/`token:`/etc. assignments
- generic 32+ char hex blobs
- Supabase-style JWTs (`eyJ...`), **role-aware**: an `anon`-role JWT is left
  alone (public by convention — same allowlist entry
  `ai-business-navigator`'s `.gitleaks.toml` carries for `.env.example`);
  `service_role`, any other role, or no role claim at all is masked
  (fail-closed default)

## gitleaks allowlist notes (`ci/gitleaks.toml`)

- `firebase_options*.dart` is path-allowlisted: Firebase's generated client
  config contains long alphanumeric strings under `apiKey:` that look like
  secrets to generic scanners, but are safe to commit per Firebase's own
  docs (access is enforced server-side by Security Rules, not by keeping
  this file secret).
- Date-prefixed vault slugs (`2026-07-03_016_...`) are regex-allowlisted,
  ported from `ai-business-navigator`'s `scripts/git-hooks/check-entropy.py`
  (commit `d5f7940`) — the first real false positive that scanner hit in
  production (a natural-language, underscore-joined filename that merely
  *looks* high-entropy).

## Dart port (`dart/`)

Same three modules (`patterns.dart`, `mask.dart`, `sinks.dart`) and the
same wiring-test shape, for Flutter apps. Standalone package — run
`flutter test` inside `packages/secret-guard/dart/`.

## Usage

```ts
import { mask, registerSink, assertAllKindsRegistered } from "@saas/secret-guard";

// Ad hoc:
mask("Bearer sk-ant-api03-...") // => "Bearer sk-[MASKED]"

// Wired (preferred — gets coverage-checked):
const maskForResponse = registerSink({ kind: "http_response", name: "my-route" });
return NextResponse.json({ error: maskForResponse(String(err)) });
```
