import { describe, it, expect } from "vitest";
import {
  findWebhookSignatureViolations,
  findCreatedTables,
  findRlsEnabledTables,
  findPolicyCoveredTables,
  findRlsExemptions,
  findRlsCoverageViolations,
  findAiRateLimitViolations,
  findRateLimitModuleViolations,
  findStorageBucketDeclarations,
  findStorageObjectsPolicyBucketIds,
  findStorageBucketVisibilityEstablished,
  findStorageBucketPolicyViolations,
  isAiEndpointRoute,
  hasAiSdkSignal,
  STRIPE_WEBHOOK_ROUTE_PATH,
  type SourceFile,
} from "../security-baseline-core";

describe("security-baseline-core: webhook signature verification (call-chain tracing)", () => {
  it("flags a tree with no webhook-shaped file at all", () => {
    const violations = findWebhookSignatureViolations([]);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("webhook-signature-missing");
    expect(violations[0].file).toBe(STRIPE_WEBHOOK_ROUTE_PATH);
  });

  it("flags a webhook route with no signature-verification call (raw JSON.parse bypass)", () => {
    const files: SourceFile[] = [
      {
        path: STRIPE_WEBHOOK_ROUTE_PATH,
        content: `
          export async function POST(req: Request) {
            const signature = req.headers.get("stripe-signature");
            const body = JSON.parse(await req.text());
            return new Response("ok");
          }
        `,
      },
    ];
    const violations = findWebhookSignatureViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("webhook-signature-missing");
    expect(violations[0].file).toBe(STRIPE_WEBHOOK_ROUTE_PATH);
  });

  it("does NOT flag a route calling stripe.webhooks.constructEvent() directly", () => {
    const files: SourceFile[] = [
      {
        path: STRIPE_WEBHOOK_ROUTE_PATH,
        content: `
          import Stripe from "stripe";
          export async function POST(req: Request) {
            const signature = req.headers.get("stripe-signature")!;
            const stripe = new Stripe("sk");
            const event = stripe.webhooks.constructEvent(await req.text(), signature, "whsec");
            return new Response("ok");
          }
        `,
      },
    ];
    expect(findWebhookSignatureViolations(files)).toEqual([]);
  });

  it("does NOT flag a route resolving to constructEvent through a local wrapper + barrel re-export (this repo's real @/lib/payments -> @saas/payments -> packages/payments/src/webhook.ts shape)", () => {
    const files: SourceFile[] = [
      {
        path: STRIPE_WEBHOOK_ROUTE_PATH,
        content: `
          import { verifyWebhookSignature } from "@/lib/payments";
          export async function POST(req: Request) {
            const signature = req.headers.get("stripe-signature")!;
            verifyWebhookSignature({} as never, "body", signature, "whsec");
            return new Response("ok");
          }
        `,
      },
      {
        path: "lib/payments/index.ts",
        content: `export { verifyWebhookSignature } from "@saas/payments";\n`,
      },
      {
        path: "packages/payments/src/index.ts",
        content: `export { verifyWebhookSignature } from "./webhook";\n`,
      },
      {
        path: "packages/payments/src/webhook.ts",
        content: `
          import type Stripe from "stripe";
          export function verifyWebhookSignature(stripe: Stripe, payload: string, signature: string, secret: string) {
            return stripe.webhooks.constructEvent(payload, signature, secret);
          }
        `,
      },
    ];
    expect(findWebhookSignatureViolations(files)).toEqual([]);
  });

  it("does NOT flag a route calling a constructStripeEvent()-named wrapper that genuinely reaches constructEvent", () => {
    const files: SourceFile[] = [
      {
        path: STRIPE_WEBHOOK_ROUTE_PATH,
        content: `
          import { constructStripeEvent } from "@/lib/stripe-kit";
          export async function POST(req: Request) {
            const signature = req.headers.get("stripe-signature")!;
            const event = constructStripeEvent(await req.text(), signature, "whsec");
            return new Response("ok");
          }
        `,
      },
      {
        path: "lib/stripe-kit.ts",
        content: `
          import type Stripe from "stripe";
          export function constructStripeEvent(payload: string, signature: string, secret: string) {
            const stripe = {} as Stripe;
            return stripe.webhooks.constructEvent(payload, signature, secret);
          }
        `,
      },
    ];
    expect(findWebhookSignatureViolations(files)).toEqual([]);
  });

  // Codex review P1-3 (ported): a handler that imports the payments barrel
  // but never CALLS the verifier must fail — the old "reachable via import
  // graph" check would have passed this because constructEvent is
  // reachable SOMEWHERE, even though nothing in this file actually invokes
  // it.
  it("FAILS when the handler imports the verifier but never calls it (import presence != invocation)", () => {
    const files: SourceFile[] = [
      {
        path: STRIPE_WEBHOOK_ROUTE_PATH,
        content: `
          import { verifyWebhookSignature } from "@/lib/payments";
          export async function POST(req: Request) {
            const signature = req.headers.get("stripe-signature");
            if (!signature) return new Response("Missing stripe-signature", { status: 400 });
            const body = JSON.parse(await req.text());
            return new Response("ok");
          }
        `,
      },
      {
        path: "lib/payments/index.ts",
        content: `export { verifyWebhookSignature } from "@saas/payments";\n`,
      },
      {
        path: "packages/payments/src/index.ts",
        content: `export { verifyWebhookSignature } from "./webhook";\n`,
      },
      {
        path: "packages/payments/src/webhook.ts",
        content: `
          import type Stripe from "stripe";
          export function verifyWebhookSignature(stripe: Stripe, payload: string, signature: string, secret: string) {
            return stripe.webhooks.constructEvent(payload, signature, secret);
          }
        `,
      },
    ];
    const violations = findWebhookSignatureViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe(STRIPE_WEBHOOK_ROUTE_PATH);
  });

  // Codex review round-2 P1 (ported): calling an UNRELATED export from a
  // module that also happens to export a real verifier must fail — the
  // terminal check must be scoped to the SPECIFIC invoked symbol's body,
  // not "constructEvent appears anywhere in the resolved file".
  it("FAILS when the handler calls an unrelated export from a module that also happens to contain constructEvent", () => {
    const files: SourceFile[] = [
      {
        path: STRIPE_WEBHOOK_ROUTE_PATH,
        content: `
          import { logWebhookReceived } from "@/lib/payments";
          export async function POST(req: Request) {
            const signature = req.headers.get("stripe-signature");
            if (!signature) return new Response("Missing stripe-signature", { status: 400 });
            logWebhookReceived();
            const body = JSON.parse(await req.text());
            return new Response("ok");
          }
        `,
      },
      {
        path: "lib/payments/index.ts",
        content: `
          import type Stripe from "stripe";
          export function verifyWebhookSignature(stripe: Stripe, payload: string, signature: string, secret: string) {
            return stripe.webhooks.constructEvent(payload, signature, secret);
          }
          export function logWebhookReceived(): void {
            console.log("webhook received");
          }
        `,
      },
    ];
    const violations = findWebhookSignatureViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe(STRIPE_WEBHOOK_ROUTE_PATH);
  });

  // Codex review round-3 P1-b (ported): a dead/unused helper elsewhere in
  // the SAME file that happens to call constructEvent must not count — only
  // the exported POST/GET/etc. entry point's own (traced) body does.
  it("FAILS when a dead/unused same-file helper calls constructEvent but the exported POST handler never invokes it", () => {
    const files: SourceFile[] = [
      {
        path: STRIPE_WEBHOOK_ROUTE_PATH,
        content: `
          import type Stripe from "stripe";

          export async function POST(req: Request) {
            const signature = req.headers.get("stripe-signature");
            if (!signature) return new Response("Missing stripe-signature", { status: 400 });
            const body = JSON.parse(await req.text());
            return new Response("ok");
          }

          function deadHelperThatCallsConstructEvent(stripe: Stripe, payload: string, sig: string, secret: string) {
            return stripe.webhooks.constructEvent(payload, sig, secret);
          }
        `,
      },
    ];
    const violations = findWebhookSignatureViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe(STRIPE_WEBHOOK_ROUTE_PATH);
  });

  it("does NOT match a signature-verification call mentioned only in a comment", () => {
    const files: SourceFile[] = [
      {
        path: STRIPE_WEBHOOK_ROUTE_PATH,
        content: `
          // Do NOT forget to call constructEvent() here!
          export async function POST(req: Request) {
            const signature = req.headers.get("stripe-signature");
            const body = JSON.parse(await req.text());
            return new Response("ok");
          }
        `,
      },
    ];
    const violations = findWebhookSignatureViolations(files);
    expect(violations).toHaveLength(1);
  });
});

describe("security-baseline-core: RLS + non-permissive policy coverage across all migrations", () => {
  it("collects CREATE TABLE names with IF NOT EXISTS and quoting variants", () => {
    const files: SourceFile[] = [
      { path: "supabase/migrations/0001_a.sql", content: "create table if not exists widgets (id uuid primary key);" },
      { path: "supabase/migrations/0002_b.sql", content: 'CREATE TABLE "Gadgets" (id uuid primary key);' },
    ];
    const created = findCreatedTables(files);
    expect(created.has("public.widgets")).toBe(true);
    expect(created.has("public.gadgets")).toBe(true);
  });

  it("collects RLS-enabled tables from the direct literal form", () => {
    const files: SourceFile[] = [
      { path: "supabase/migrations/0001_a.sql", content: "alter table widgets enable row level security;" },
    ];
    expect(findRlsEnabledTables(files).has("public.widgets")).toBe(true);
  });

  it("collects RLS-enabled tables from the dynamic %I + array[...] loop form (saas-builder's actual 0012/0014 pattern)", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0012_enable_rls.sql",
        content: `
          do $$
          declare t text;
          begin
            foreach t in array array['billing_products', 'subscriptions']
            loop
              execute format('alter table %I enable row level security', t);
            end loop;
          end $$;
        `,
      },
    ];
    const enabled = findRlsEnabledTables(files);
    expect(enabled.has("public.billing_products")).toBe(true);
    expect(enabled.has("public.subscriptions")).toBe(true);
  });

  it("PASSES when every table has RLS AND a non-permissive policy, both enabled via a %I-parameterized loop (this repo's real pattern)", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_init.sql",
        content: `
          create table widgets (id uuid primary key);
          create table gadgets (id uuid primary key);
          do $$
          declare t text;
          begin
            foreach t in array array['widgets', 'gadgets']
            loop
              execute format('alter table %I enable row level security', t);
              execute format(
                'create policy %I on %I for select using (tenant_id in (select public.current_user_tenant_ids()))',
                t || '_select_tenant', t
              );
            end loop;
          end $$;
        `,
      },
    ];
    expect(findRlsCoverageViolations(files)).toEqual([]);
  });

  it("FAILS a table created with no RLS migration anywhere", () => {
    const files: SourceFile[] = [
      { path: "supabase/migrations/0001_create.sql", content: "create table if not exists leaky_table (id uuid primary key, secret text);" },
    ];
    const violations = findRlsCoverageViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("rls-missing");
    expect(violations[0].message).toContain("leaky_table");
  });

  // Codex review P1-1 (ported): RLS enabled with ZERO policies must still
  // fail — the checklist requires BOTH.
  it("FAILS when RLS is enabled but no policy targets the table", () => {
    const files: SourceFile[] = [
      { path: "supabase/migrations/0001_init.sql", content: "create table secrets (id uuid primary key);\nalter table secrets enable row level security;\n" },
    ];
    const violations = findRlsCoverageViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("secrets");
    expect(violations[0].message).toContain("no non-permissive CREATE POLICY targets it");
  });

  // Codex review round-3 P1-a (ported): an unconditional USING (true) /
  // 1=1 / empty predicate must not count as coverage.
  it("FAILS when the only policy has an unconditional USING (true) predicate", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_init.sql",
        content: "create table accounts (id uuid primary key);\nalter table accounts enable row level security;\ncreate policy p on accounts using (true);\n",
      },
    ];
    const violations = findRlsCoverageViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("accounts");
    expect(findPolicyCoveredTables(files).has("public.accounts")).toBe(false);
  });

  it("FAILS when the only policy has a bare 1=1 predicate", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_init.sql",
        content: "create table sessions (id uuid primary key);\nalter table sessions enable row level security;\ncreate policy p on sessions using (1=1);\n",
      },
    ];
    expect(findRlsCoverageViolations(files)).toHaveLength(1);
  });

  it("PASSES when a policy has a real predicate referencing auth.uid()", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_init.sql",
        content:
          "create table widgets (id uuid primary key, owner_id uuid not null);\n" +
          "alter table widgets enable row level security;\n" +
          "create policy widgets_select_own on widgets for select using (owner_id = auth.uid());\n",
      },
    ];
    expect(findRlsCoverageViolations(files)).toEqual([]);
  });

  // Codex review P1-2 (ported): schema must be preserved in the canonical
  // key — public.events and private.events must not alias.
  it("FAILS private.events (no RLS) while public.events (has RLS+policy) correctly passes", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_init.sql",
        content:
          "create table public.events (id uuid primary key, owner_id uuid not null);\n" +
          "alter table public.events enable row level security;\n" +
          "create policy events_select on public.events for select using (owner_id = auth.uid());\n\n" +
          "create table private.events (id uuid primary key);\n",
      },
    ];
    const violations = findRlsCoverageViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("private.events");
    expect(violations[0].message).not.toContain('"public.events"');
  });

  // Codex review round-3 P2-c (ported): both-parts-quoted identifiers must
  // resolve correctly, not collapse to a wrong synthetic key.
  it('FAILS for "private"."events" (both parts quoted) while public.events correctly passes', () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_init.sql",
        content:
          "create table public.events (id uuid primary key, owner_id uuid not null);\n" +
          "alter table public.events enable row level security;\n" +
          "create policy events_select on public.events for select using (owner_id = auth.uid());\n\n" +
          'create table "private"."events" (id uuid primary key);\n',
      },
    ];
    const violations = findRlsCoverageViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("private.events");
    expect(violations[0].message).not.toContain("public.private");
  });

  // Codex review round-2 P2 (ported): an unrelated array[...] in the same
  // DO block, never iterated by the RLS/policy-enabling FOREACH loop, must
  // not vouch for a table's coverage.
  it("FAILS a table that only appears in an unrelated array[...] in the same do $$ block, not the RLS-enabling loop's own array", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_init.sql",
        content: `
          create table covered_table (id uuid primary key, tenant_id uuid not null);
          create table uncovered_table (id uuid primary key);

          do $$
          declare t text;
          begin
            foreach t in array array['covered_table']
            loop
              execute format('alter table %I enable row level security', t);
              execute format(
                'create policy %I on %I for select using (tenant_id in (select public.current_user_tenant_ids()))',
                t || '_select', t
              );
            end loop;

            perform array['uncovered_table'];
          end $$;
        `,
      },
    ];
    const violations = findRlsCoverageViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("public.uncovered_table");
  });

  it("respects the legacy RLS_ALLOWLIST array for an intentionally-exempt table", () => {
    const files: SourceFile[] = [
      { path: "supabase/migrations/0001_create.sql", content: "create table if not exists static_lookup (id uuid primary key);" },
    ];
    expect(
      findRlsCoverageViolations(files, [{ table: "static_lookup", reason: "static reference data" }])
    ).toEqual([]);
  });

  // The recommended (2026-07-20) exemption mechanism: inline comment
  // co-located with the CREATE TABLE statement — mirrors
  // supabase/migrations/0015_commissions_idempotency.sql's real usage.
  it("respects an inline `-- rls-exempt:` comment on the line before CREATE TABLE", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0015_commissions_idempotency.sql",
        content:
          "-- rls-exempt: service-role-only audit/backup table, deliberately zero policies\n" +
          "create table if not exists commissions_duplicates_backup (id uuid primary key);\n" +
          "alter table commissions_duplicates_backup enable row level security;\n",
      },
    ];
    const violations = findRlsCoverageViolations(files);
    expect(violations).toEqual([]);
    expect(findRlsExemptions(files).get("public.commissions_duplicates_backup")).toContain(
      "service-role-only"
    );
  });

  it("does NOT exempt a table via a `-- rls-exempt:` comment two lines above (out of range)", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_init.sql",
        content:
          "-- rls-exempt: this comment is too far away to count\n\n" +
          "create table if not exists leaky_table (id uuid primary key);\n",
      },
    ];
    expect(findRlsCoverageViolations(files)).toHaveLength(1);
  });
});

describe("security-baseline-core: AI endpoint rate-limit wiring", () => {
  it("recognizes generate-* endpoints as AI endpoints", () => {
    expect(isAiEndpointRoute("app/api/projects/[projectId]/generate-blueprint/route.ts")).toBe(true);
    expect(isAiEndpointRoute("app/api/projects/rewrite-brief/route.ts")).toBe(true);
  });

  it("does NOT treat an unrelated route as an AI endpoint", () => {
    expect(isAiEndpointRoute("app/api/billing/checkout/route.ts")).toBe(false);
  });

  it("FAILS an AI endpoint route with no rateLimit() call", () => {
    const files: SourceFile[] = [
      {
        path: "app/api/projects/[projectId]/generate-blueprint/route.ts",
        content: `
          export async function POST(req: Request) {
            const body = await req.json();
            return new Response("ok");
          }
        `,
      },
    ];
    const violations = findAiRateLimitViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("ai-endpoint-no-rate-limit");
  });

  it("PASSES an AI endpoint route that calls rateLimit()", () => {
    const files: SourceFile[] = [
      {
        path: "app/api/projects/[projectId]/generate-blueprint/route.ts",
        content: `
          import { rateLimit } from "@/lib/rate-limit";
          export async function POST(req: Request) {
            const allowed = await rateLimit("generate:user1", 5, 60_000);
            if (!allowed) return new Response("rate limited", { status: 429 });
            return new Response("ok");
          }
        `,
      },
    ];
    expect(findAiRateLimitViolations(files)).toEqual([]);
  });

  it("does NOT match a rateLimit() call mentioned only in a comment", () => {
    const files: SourceFile[] = [
      {
        path: "app/api/projects/[projectId]/generate-blueprint/route.ts",
        content: `
          // TODO: call rateLimit() here
          export async function POST(req: Request) {
            return new Response("ok");
          }
        `,
      },
    ];
    expect(findAiRateLimitViolations(files)).toHaveLength(1);
  });

  it("hasAiSdkSignal detects a direct OpenAI SDK call regardless of path", () => {
    expect(hasAiSdkSignal('import OpenAI from "openai";\nconst client = new OpenAI();')).toBe(true);
    expect(
      hasAiSdkSignal('import Anthropic from "@anthropic-ai/sdk";\nclient.messages.create({});')
    ).toBe(true);
    expect(hasAiSdkSignal('const r = await streamText({ model, prompt });')).toBe(true);
  });

  it("hasAiSdkSignal does NOT fire on unrelated code (no false positive)", () => {
    expect(hasAiSdkSignal('const rows = await supabase.from("t").select("*").limit(10);')).toBe(false);
  });

  it("FAILS a non-AI-named route (app/api/chat) that directly calls an LLM SDK with no rate limit", () => {
    const files: SourceFile[] = [
      {
        path: "app/api/chat/route.ts",
        content: `
          import OpenAI from "openai";
          const client = new OpenAI();
          export async function POST(req: Request) {
            const { messages } = await req.json();
            const completion = await client.chat.completions.create({ model: "gpt-4", messages });
            return new Response(JSON.stringify(completion));
          }
        `,
      },
    ];
    const violations = findAiRateLimitViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("app/api/chat/route.ts");
  });

  it("FAILS a route importing this repo's task-router LLM wrapper (executeTask) under a non-generate-* path, mirroring split-run-to-files", () => {
    const files: SourceFile[] = [
      {
        path: "app/api/projects/[projectId]/split-run-to-files/route.ts",
        content: `
          import { executeTask } from "@/lib/providers/task-router";
          export async function POST(req: Request) {
            const result = await executeTask("file_split", "some prompt");
            return new Response(JSON.stringify(result));
          }
        `,
      },
    ];
    const violations = findAiRateLimitViolations(files);
    expect(violations).toHaveLength(1);
  });

  it("FAILS a route calling fetch() against the Claude API directly, mirroring app/api/documents/diff/route.ts's document-diff wrapper", () => {
    const files: SourceFile[] = [
      {
        path: "app/api/documents/diff/route.ts",
        content: `
          import { compareDocuments } from "@/lib/document-analysis/document-diff";
          export async function POST(req: Request) {
            const result = await compareDocuments({ oldText: "a", newText: "b" });
            return new Response(JSON.stringify(result));
          }
        `,
      },
    ];
    const violations = findAiRateLimitViolations(files);
    expect(violations).toHaveLength(1);
  });

  it("does NOT flag a sibling lib/providers/* import that never calls an LLM (template-scoreboard / provider-scoreboard — pure DB aggregation)", () => {
    const files: SourceFile[] = [
      {
        path: "app/api/scoreboard/route.ts",
        content: `
          import { buildScoreboard } from "@/lib/providers/template-scoreboard";
          export async function GET() {
            return new Response(JSON.stringify(buildScoreboard([], [], [], [])));
          }
        `,
      },
      {
        path: "app/api/provider-scoreboard/route.ts",
        content: `
          import { buildProviderScoreboard } from "@/lib/providers/provider-scoreboard";
          export async function GET() {
            return new Response(JSON.stringify(buildProviderScoreboard([])));
          }
        `,
      },
    ];
    expect(findAiRateLimitViolations(files)).toEqual([]);
  });

  it("PASSES an AI endpoint using the checkRateLimit()/aiRatelimit naming a derived project might use", () => {
    const filesCheckRateLimit: SourceFile[] = [
      {
        path: "app/api/projects/[projectId]/generate-blueprint/route.ts",
        content: `
          import { checkRateLimit } from "@/lib/ratelimit";
          export async function POST(req: Request) {
            await checkRateLimit("generate", req);
            return new Response("ok");
          }
        `,
      },
    ];
    expect(findAiRateLimitViolations(filesCheckRateLimit)).toEqual([]);
  });

  it("ignores non-AI-path routes entirely, even with no rate limit", () => {
    const files: SourceFile[] = [
      { path: "app/api/users/route.ts", content: `export async function GET() { return new Response("ok"); }` },
    ];
    expect(findAiRateLimitViolations(files)).toEqual([]);
  });
});

describe("security-baseline-core: rate-limit module baseline", () => {
  it("flags a missing lib/rate-limit.ts", () => {
    const violations = findRateLimitModuleViolations("lib/rate-limit.ts", null);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("rate-limit-module-missing");
  });

  it("flags a rate-limit module with no AI/generation-scoped bucket", () => {
    const content = `
      export async function rateLimit(key: string) {
        return true;
      }
    `;
    const violations = findRateLimitModuleViolations("lib/rate-limit.ts", content);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("rate-limit-module-missing-ai-bucket");
  });

  it("passes when the module defines a generate-scoped Ratelimit bucket (current lib/rate-limit.ts shape)", () => {
    const content = `
      const generateLimiter = redis
        ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "60 s"), prefix: "rl:generate" })
        : null;
    `;
    expect(findRateLimitModuleViolations("lib/rate-limit.ts", content)).toEqual([]);
  });
});

describe("security-baseline-core: Storage bucket policy", () => {
  it("passes vacuously when no migration declares a storage bucket (saas-builder's current state)", () => {
    const files: SourceFile[] = [
      { path: "supabase/migrations/0001_init.sql", content: "create table widgets (id uuid primary key);\n" },
    ];
    expect(findStorageBucketDeclarations(files)).toEqual([]);
    expect(findStorageBucketPolicyViolations(files)).toEqual([]);
  });

  it("FAILS when a bucket is created with no explicit public flag and no storage.objects policy", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_bucket.sql",
        content: "insert into storage.buckets (id, name) values ('avatars', 'avatars');\n",
      },
    ];
    const violations = findStorageBucketPolicyViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("no-storage-bucket-policy");
    expect(violations[0].message).toContain("avatars");
  });

  it("PASSES when the bucket has an explicit public flag and a scoped storage.objects policy", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_bucket.sql",
        content: `
          insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false);

          create policy "avatars_tenant_isolation"
          on storage.objects for all
          using (bucket_id = 'avatars');
        `,
      },
    ];
    expect(findStorageBucketPolicyViolations(files)).toEqual([]);
    expect(findStorageObjectsPolicyBucketIds(files).has("avatars")).toBe(true);
  });

  // Codex review round-3 P2-d (ported): the `public` column being LISTED
  // is not enough — its VALUE must be a concrete true/false literal. NULL
  // must fail even with a real policy present.
  it("FAILS when the bucket's public column is explicitly NULL, even with a policy present", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_bucket.sql",
        content: `
          insert into storage.buckets (id, name, public) values ('uploads', 'uploads', NULL);

          create policy "uploads_tenant_isolation"
          on storage.objects for all
          using (bucket_id = 'uploads');
        `,
      },
    ];
    const violations = findStorageBucketPolicyViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("no statement anywhere in migration history sets an explicit");
  });

  it("FAILS when an UPDATE sets public = NULL (UPDATE form)", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_bucket.sql",
        content: `
          update storage.buckets set public = NULL where id = 'uploads';

          create policy "uploads_tenant_isolation"
          on storage.objects for all
          using (bucket_id = 'uploads');
        `,
      },
    ];
    const violations = findStorageBucketPolicyViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("uploads");
  });

  // ---------------------------------------------------------------
  // Codex review P2 (2026-07-20): the per-statement evaluation above
  // produced false positives once a bucket's declaration spans MULTIPLE
  // migrations (INSERT in one, UPDATE in a later one) — see
  // findStorageBucketVisibilityEstablished()'s doc comment. Fixed by
  // aggregating visibility BY BUCKET ID across the whole migration
  // history: established the moment ANY statement for that ID sets a
  // concrete boolean, regardless of which statement(s) don't.
  // ---------------------------------------------------------------

  it("PASSES when an insert with no `public` value is followed by a later UPDATE that explicitly sets public = false", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_bucket.sql",
        content: "insert into storage.buckets (id, name) values ('avatars', 'avatars');\n",
      },
      {
        path: "supabase/migrations/0002_bucket_lockdown.sql",
        content:
          "update storage.buckets set public = false where id = 'avatars';\n\n" +
          "create policy \"avatars_tenant_isolation\" on storage.objects for all using (bucket_id = 'avatars');\n",
      },
    ];
    expect(findStorageBucketVisibilityEstablished(files).has("avatars")).toBe(true);
    expect(findStorageBucketPolicyViolations(files)).toEqual([]);
  });

  it("FAILS when an insert with no `public` value is followed only by an UNRELATED later update (file_size_limit only) — visibility never established anywhere", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_bucket.sql",
        content: "insert into storage.buckets (id, name) values ('avatars', 'avatars');\n",
      },
      {
        path: "supabase/migrations/0002_bucket_resize.sql",
        content:
          "update storage.buckets set file_size_limit = 5242880 where id = 'avatars';\n\n" +
          "create policy \"avatars_tenant_isolation\" on storage.objects for all using (bucket_id = 'avatars');\n",
      },
    ];
    expect(findStorageBucketVisibilityEstablished(files).has("avatars")).toBe(false);
    const violations = findStorageBucketPolicyViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("no statement anywhere in migration history sets an explicit");
  });

  it("PASSES an unrelated later UPDATE (file_size_limit only) when visibility was already established by an earlier statement", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_bucket.sql",
        content:
          "insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false);\n\n" +
          "create policy \"avatars_tenant_isolation\" on storage.objects for all using (bucket_id = 'avatars');\n",
      },
      {
        path: "supabase/migrations/0002_bucket_resize.sql",
        content: "update storage.buckets set file_size_limit = 5242880 where id = 'avatars';\n",
      },
    ];
    expect(findStorageBucketPolicyViolations(files)).toEqual([]);
  });

  it("still FAILS a bucket with visibility established but NO corresponding storage.objects policy (does not regress the check's actual purpose)", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_bucket.sql",
        content: "insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);\n",
      },
      {
        path: "supabase/migrations/0002_bucket_resize.sql",
        content: "update storage.buckets set file_size_limit = 5242880 where id = 'avatars';\n",
      },
    ];
    expect(findStorageBucketVisibilityEstablished(files).has("avatars")).toBe(true);
    const violations = findStorageBucketPolicyViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("no `create policy ... on storage.objects");
    expect(violations[0].message).not.toContain("no statement anywhere in migration history sets an explicit");
  });

  it("reports exactly ONE violation for a bucket declared across multiple non-compliant statements, not one per statement", () => {
    const files: SourceFile[] = [
      {
        path: "supabase/migrations/0001_bucket.sql",
        content: "insert into storage.buckets (id, name) values ('avatars', 'avatars');\n",
      },
      {
        path: "supabase/migrations/0002_bucket_resize.sql",
        content: "update storage.buckets set file_size_limit = 5242880 where id = 'avatars';\n",
      },
    ];
    const violations = findStorageBucketPolicyViolations(files);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe("supabase/migrations/0001_bucket.sql");
  });
});
