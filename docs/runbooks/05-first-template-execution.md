# First Template Execution Runbook
# membership_content_affiliate

## Purpose

Run the first full end-to-end generation for the fixed template:
membership_content_affiliate

The goal is not perfection.
The goal is to identify the first real failure point.

---

## Success Definition

A run is considered successful enough for first execution if:

1. project is created
2. full template generation starts
3. generation run is recorded
4. blueprint is saved
5. implementation plan is saved
6. schema is saved
7. api design is saved
8. generated files are saved
9. files are exported
10. quality gate runs
11. first failure point is identifiable

Green is ideal.
Localized failure is acceptable.
Unknown failure is not acceptable.

---

## Pre-Run Checklist

Before running the first template, confirm all of these:

### Environment

- NEXT_PUBLIC_APP_URL is set
- NEXT_PUBLIC_SUPABASE_URL is set
- NEXT_PUBLIC_SUPABASE_ANON_KEY is set
- SUPABASE_SERVICE_ROLE_KEY is set
- GEMINI_API_KEY is set
- CLAUDE_API_KEY is set
- STRIPE_SECRET_KEY is set if billing is included
- STRIPE_WEBHOOK_SECRET is set if webhook route exists

### Database

- migrations through current latest migration are applied
- projects table exists
- blueprints table exists
- implementation_runs table exists
- generated_files table exists
- generation_runs table exists
- quality_runs table exists
- contents table exists
- membership_plans table exists

### Prompt Files

- prompts/final/01-blueprint-final.md exists
- prompts/final/02-schema-final.md exists
- prompts/final/03-api-final.md exists
- prompts/final/04-ui-final.md exists
- prompts/final/05-file-split-final.md exists

### Rules

- docs/rules/* files exist
- final prompts reference current rules correctly

### Builder

- project creation page works
- project detail page works
- Generate Full Template button exists
- Generation Runs section exists
- Quality Runs section exists

---

## Fixed Test Input

Use this exact input for the first run.

### Project Input

- name: SalonCore First Run
- summary: オンラインサロン運営者向けに、会員管理、限定コンテンツ、月額課金、紹介制度をまとめて扱えるSaaS
- targetUsers: 小規模から中規模のオンラインサロン運営者
- problemToSolve: 会員管理、コンテンツ配信、定期課金、紹介制度が分散していて運営が煩雑
- referenceServices: UTAGE, Circle
- brandTone: modern
- templateKey: membership_content_affiliate
- requiredFeatures:
  - member_management
  - content_management
  - subscription_billing
  - affiliate_links
  - admin_dashboard
- managedData:
  - members
  - contents
  - plans
  - commissions
- endUserCreatedData:
  - profile
  - comments
- roles:
  - owner
  - admin
  - member
- billingModel: subscription
- affiliateEnabled: true
- visibilityRule: members_only
- mvpScope:
  - auth
  - tenant
  - roles
  - content_crud
  - subscription_billing
  - affiliate_tracking
- excludedInitialScope:
  - advanced_analytics
  - mobile_app
  - multi_language
  - automation_builder
- stackPreference: Next.js + Supabase + Stripe
- notes: first execution run
- priority: high

---

## Run Procedure

### Step 1

Create a new project using the fixed input above.

### Step 2

Open the project detail page.

### Step 3

Confirm these sections render:

- Project Summary
- Generation Actions
- Latest Blueprint
- Generation Runs
- Quality Runs
- Generated Files

### Step 4

Click:

- Generate Full Template

### Step 5

Wait for the generation run to finish or fail.

Do not debug yet.
First observe.

---

## What To Record

For this first execution, record the following:

### Project

- project id
- template key
- created timestamp

### Generation Run

- generation run id
- overall status
- current_step
- error_message if present

### Per Step Status

Record each of these:

- blueprint
- implementation
- schema
- api_design
- split_files
- export_files

### Saved Artifacts

Record counts:

- blueprints count
- implementation_runs count
- generated_files count

### Export

Record:

- export root path
- exported file count

### Quality

Record:

- quality run status
- lint_status
- typecheck_status
- playwright_status

---

## Debug Decision Tree

### Case A: Project creation fails

Stop.
Fix:

- /api/projects
- validation
- supabase admin connection

Do not inspect prompts yet.

### Case B: Full template run does not start

Stop.
Fix:

- generate-template route
- generation_runs insert
- internal route calling

### Case C: Blueprint fails

Stop.
Inspect:

- project metadata_json
- project_input assembly
- final blueprint prompt
- Gemini / Claude output format

Do not inspect schema or UI yet.

### Case D: Implementation fails

Stop.
Inspect:

- latest blueprint content
- implementation prompt
- Claude request/response
- prompt placeholder replacement

Do not inspect file split yet.

### Case E: Schema fails

Stop.
Inspect:

- latest blueprint JSON
- schema prompt
- placeholder names
- Claude schema output
- whether output is SQL or mixed explanation

### Case F: API design fails

Stop.
Inspect:

- schema output
- API final prompt
- placeholder replacement
- whether schema_sql is actually passed

### Case G: split_files fails

Stop.
Inspect:

- implementation output text
- file split prompt
- whether JSON array only was returned
- whether forbidden paths were emitted

### Case H: export_files fails

Stop.
Inspect:

- generated_files.file_path
- safe path rules
- export scaffold write
- duplicate path/version handling

### Case I: quality gate fails

Proceed in this order:

1. install
2. lint
3. typecheck
4. playwright

Never debug playwright first if lint or typecheck are red.

---

## Expected Healthy First Run

A healthy first run often looks like this:

- blueprint: completed
- implementation: completed
- schema: completed
- api_design: completed
- split_files: completed
- export_files: completed
- quality gate:
  - install: pass
  - lint: may fail or pass
  - typecheck: may fail
  - playwright: may fail

This is acceptable.

The first target is not perfect green.
The first target is:

- deterministic output
- saved artifacts
- localized failures

---

## Minimum Acceptance Criteria

Accept the first run as useful if all of the following are true:

- generation run exists
- at least blueprint is saved
- at least one implementation_run is saved
- generated_files has records
- export directory exists
- quality run exists
- first failure point is obvious

If these are true, the run is useful.

---

## Immediate Post-Run Review

After the run, review in this exact order:

### 1. Latest Blueprint

Confirm:

- only allowed entities
- only allowed roles
- only allowed screens
- billing = subscription
- affiliate enabled = true

### 2. Schema Output

Confirm:

- contents table present or aligned
- membership_plans table present or aligned
- no unrelated tables
- no renamed existing tables

### 3. API Design Output

Confirm:

- only allowed routes
- tenant boundary mentioned
- role boundary mentioned
- zod validation mentioned
- audit log mentioned

### 4. Generated Files

Confirm:

- only allowed file paths
- no forbidden core rewrites
- no markdown explanation inside content_text
- no duplicate conflicting files

### 5. Export Directory

Confirm:

- package.json exists
- tsconfig.json exists
- next.config.ts exists
- playwright.config.ts exists
- app/layout.tsx exists
- app/page.tsx exists

### 6. Quality Output

Confirm:

- install result exists
- lint output exists
- typecheck output exists
- playwright output exists

---

## Output Log Template

Use this format to record the result.

### First Run Log

- Project ID:
- Generation Run ID:
- Template Key:
- Overall Generation Status:
- Failed Step:
- Error Message:

### Step Results

- blueprint:
- implementation:
- schema:
- api_design:
- split_files:
- export_files:

### Saved Counts

- blueprints:
- implementation_runs:
- generated_files:

### Export

- export root:
- exported files count:

### Quality

- quality run status:
- lint:
- typecheck:
- playwright:

### Notes

- first real failure point:
- suspected root cause:
- next fix target:

---

## GREEN Baseline Notes (v1)

### Next.js 15 Async Cookies

- `cookies()` from `next/headers` is async in Next.js 15
- Scaffold `src/lib/supabase/server.ts` must use `await cookies()`
- Sync usage causes build/typecheck failure

### Supabase Compat Files

- `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts` are required
- AI-generated code imports from these paths
- Scaffold must write them before quality gate runs

### tsconfig Path Alias

- `@/*` must map to `./src/*`
- If mapping is wrong, all `@/lib/...` imports fail typecheck

### IP Address

- Do not use `request.ip` — not available in all Next.js runtimes
- Use header-based approach (`x-forwarded-for`) if IP is needed

### Stripe apiVersion

- Do not hardcode `apiVersion` in exported/generated code
- Builder-side `lib/billing/stripe.ts` may use it, but exported code should not

---

## Rule After First Run

After the first run:

- do not add features
- do not add a second template
- do not broaden scope

Only do one of these:

- fix the first broken stage
- rerun
- compare

That is the correct loop.
