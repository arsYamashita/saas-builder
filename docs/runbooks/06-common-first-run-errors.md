# Common First Run Errors
# membership_content_affiliate

## Purpose

This document lists the most common first-run failures and the fastest fix pattern.

Rule:
Always fix the earliest broken stage first.

Do not patch downstream noise before fixing upstream causes.

---

## Error 1: .env.local missing or variable name mismatch

### Symptoms

- API route fails immediately
- error contains:
  - GEMINI_API_KEY is missing
  - CLAUDE_API_KEY is missing
  - Supabase admin environment variables are missing
  - STRIPE_SECRET_KEY is missing

### Root Cause

- `.env.local` does not exist
- variable name in code and env do not match
- dev server was not restarted after editing `.env.local`

### Fix Template

1. create `.env.local`
2. ensure these names match code exactly:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY
   - GEMINI_API_KEY
   - CLAUDE_API_KEY
   - STRIPE_SECRET_KEY
   - STRIPE_WEBHOOK_SECRET
3. restart dev server

### Fast Check

```bash
cat .env.local
npm run dev
```

---

## Error 2: Supabase table not found

### Symptoms

- error contains:
  - relation "projects" does not exist
  - relation "blueprints" does not exist
  - relation "generation_runs" does not exist
  - relation "quality_runs" does not exist

### Root Cause

- migrations were not applied
- migration order is broken
- local database and target database differ

### Fix Template

1. run migrations
2. verify tables exist
3. rerun the same request

### Fast Check

```bash
npx supabase db push
```

---

## Error 3: Prompt file not found

### Symptoms

- error contains:
  - ENOENT
  - no such file or directory
  - failed to read prompt
- generation fails before AI call

### Root Cause

- file missing in `prompts/final/`
- filename mismatch
- old prompt filename still referenced

### Fix Template

1. confirm these files exist:
   - prompts/final/01-blueprint-final.md
   - prompts/final/02-schema-final.md
   - prompts/final/03-api-final.md
   - prompts/final/04-ui-final.md
   - prompts/final/05-file-split-final.md
2. confirm route uses correct filename
3. rerun

### Fast Check

```bash
find prompts -type f | sort
```

---

## Error 4: Placeholder mismatch in prompt replacement

### Symptoms

- AI output is empty
- AI ignores blueprint content
- output is generic and unrelated
- schema/api generation fails with vague structure

### Root Cause

- prompt uses `{{blueprint_json}}` but code replaces `{{blueprint_normalized_json}}`
- prompt uses `{{implementation_output}}` but code replaces different key
- replacement happened twice or not at all

### Fix Template

1. open prompt file
2. find exact placeholder
3. make code replace the exact same placeholder
4. rerun only that stage

### Fast Check

Search pairs:

- `{{blueprint_json}}`
- `{{schema_sql}}`
- `{{implementation_output}}`

---

## Error 5: AI returned markdown or commentary instead of strict JSON

### Symptoms

- JSON.parse fails
- file split fails
- blueprint validation fails
- output begins with:
  - ````
  - Here is the result
  - Explanation:

### Root Cause

- prompt was not strict enough
- model ignored JSON-only rule
- code did not strip code fences before parse

### Fix Template

1. ensure prompt says:
   - Return JSON only
   - Do not wrap in markdown
   - Do not add explanations
2. keep `extractJson()` logic
3. if repeated, strengthen system prompt
4. rerun

### Safe Patch

When parsing model output:

- strip code fences
- trim
- parse
- validate

---

## Error 6: Blueprint contains forbidden entities or roles

### Symptoms

- entities like:
  - booking
  - lesson
  - course
  - feed
- roles like:
  - editor
  - superadmin
  - moderator

### Root Cause

- blueprint prompt too open
- rules not injected
- template scope not enforced

### Fix Template

1. reject this blueprint
2. confirm final blueprint prompt is used
3. confirm rules files are present
4. rerun blueprint stage

### Accept Only

Entities:

- content
- membership_plan
- subscription
- affiliate
- referral
- commission

Roles:

- owner
- admin
- member

---

## Error 7: Generated file path is forbidden or unsafe

### Symptoms

- export step fails
- generated_files contain:
  - lib/custom-auth.ts
  - app/admin/page.tsx
  - ../something
  - absolute path

### Root Cause

- file split prompt too permissive
- file path rules not enforced
- safe path filter rejected output

### Fix Template

1. do not export those files
2. reject them in review
3. strengthen file split prompt
4. rerun split_files stage only

### Accept Rule

Only allowed file paths from `02-file-path-rules.md`.

---

## Error 8: Import path mismatch

### Symptoms

- typecheck fails
- error contains:
  - Cannot find module '@/...'
  - Cannot find module './...'
- generated file imports path that does not exist

### Root Cause

- generated file path and import path disagree
- export wrote file into different directory
- AI used relative import instead of `@/`

### Fix Template

1. inspect failing import
2. inspect actual exported path
3. fix file path or import path, not both blindly
4. prefer `@/` alias
5. rerun export + typecheck

### Good Rule

Always prefer:

```typescript
import { X } from "@/lib/..."
```

---

## Error 9: Client/Server boundary broken

### Symptoms

- build/typecheck fails
- page crashes
- errors like:
  - useState in server component
  - useRouter in server component
  - cookies in client component
  - node module imported in client component

### Root Cause

- client component missing `"use client"`
- server-only logic moved into client file
- generated UI mixed runtime responsibilities

### Fix Template

1. if file uses:
   - useState
   - useEffect
   - useRouter
   - useParams

   add `"use client"`

2. move DB/auth logic out of client component
3. keep server pages thin and fetch server-side where possible

### Fast Heuristic

Client:

- forms
- edit pages with hooks

Server:

- list pages
- protected dashboard pages
- DB reads

---

## Error 10: Quality gate fails before meaningful checks

### Symptoms

- npm install fails
- lint fails on syntax
- typecheck fails everywhere
- playwright fails because app never boots

### Root Cause

- export scaffold missing
- generated files malformed
- package.json / tsconfig / next-env.d.ts missing
- app/layout.tsx missing

### Fix Template

1. verify export scaffold exists:
   - package.json
   - tsconfig.json
   - next.config.ts
   - eslint.config.mjs
   - playwright.config.ts
   - next-env.d.ts
   - app/layout.tsx
   - app/page.tsx
2. rerun export
3. rerun quality gate
4. only then inspect lint/typecheck details

### Triage Rule

Always inspect in order:

1. install
2. lint
3. typecheck
4. playwright

---

## Error 11: Typecheck fails due to compat file or alias issues

### Symptoms

- typecheck fails with:
  - Cannot find module '@/lib/supabase/server'
  - Cannot find module '@/lib/permissions/rbac'
  - Type 'Promise<ReadonlyRequestCookies>' is not assignable
  - Module '"stripe"' has no exported member matching apiVersion

### Typical Causes

1. **Compat file missing** — scaffold did not write `src/lib/supabase/server.ts` or `client.ts`
2. **Path alias mismatch** — tsconfig `@/*` does not map to `./src/*`
3. **SDK type drift** — @supabase/ssr or stripe SDK updated, types changed
4. **Async cookies** — server.ts uses sync `cookies()` but Next.js 15 requires async

### Fix Template

1. Verify compat files exist in export directory:
   - `src/lib/supabase/server.ts`
   - `src/lib/supabase/client.ts`
2. Verify tsconfig.json paths: `@/*` -> `./src/*`
3. Verify `cookies()` is awaited in server.ts
4. If AI-generated `rbac.ts` is missing, check generated_files for the path
5. Rerun export + typecheck

### Fast Check

```bash
ls exports/projects/<id>/src/lib/supabase/
cat exports/projects/<id>/tsconfig.json | grep -A2 paths
```

---

## Fast Triage Matrix

### If blueprint fails

Check:

- project input
- final blueprint prompt
- rules injection
- placeholder replacement

### If schema fails

Check:

- latest blueprint
- final schema prompt
- blueprint_json replacement
- SQL-only output

### If api_design fails

Check:

- schema output exists
- schema_sql replacement
- final api prompt

### If split_files fails

Check:

- implementation output exists
- JSON array only rule
- file path rules

### If export fails

Check:

- generated_files count
- file_path safety
- export scaffold

### If typecheck fails

Check:

- import alias
- missing files
- client/server boundary

---

## One-Change Rule

When fixing first-run failures:

- change one thing only
- rerun
- compare result

Do not:

- rewrite prompts and routes and rules together
- add new features while debugging
- start second template

---

## Minimal Recovery Sequence

Use this exact order.

1. identify first failed stage
2. fix only that stage
3. rerun that stage or full pipeline
4. inspect saved artifacts
5. export again
6. rerun quality gate

---

## Logging Template

Use this after each fix.

### Fix Log

- failed stage:
- exact error:
- suspected root cause:
- changed files:
- rerun result:
- next action:
