import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * End-to-end test of `scripts/security-baseline-check.ts` (the CLI
 * wrapper, not just the pure `security-baseline-core.ts` functions
 * unit-tested in scripts/__tests__/security-baseline-core.test.ts).
 *
 * Builds a disposable throwaway repo per test (app/api + lib +
 * supabase/migrations — no git history needed, unlike
 * security-gate-check.ts, since this gate scans the WHOLE tree rather
 * than diffing against a base ref) and runs the actual script against it
 * via child_process, proving the exit-code contract end to end:
 * 0 = clean, 1 = real violation found, 2 = the gate's own tooling failed.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TSX_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
const GATE_SCRIPT = path.join(REPO_ROOT, "scripts", "security-baseline-check.ts");

const tempDirs: string[] = [];

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "security-baseline-test-"));
  tempDirs.push(dir);

  fs.mkdirSync(path.join(dir, "app/api/stripe/webhook"), { recursive: true });
  fs.mkdirSync(path.join(dir, "supabase/migrations"), { recursive: true });
  fs.mkdirSync(path.join(dir, "lib"), { recursive: true });

  // A clean, fully-compliant baseline: a webhook handler PROVEN (by
  // call-chain tracing, not just text presence) to invoke
  // stripe.webhooks.constructEvent() directly; one table with RLS enabled
  // AND a real (non-permissive) policy; and an AI endpoint wired to a
  // generate-scoped limiter.
  fs.writeFileSync(
    path.join(dir, "app/api/stripe/webhook/route.ts"),
    'import Stripe from "stripe";\n' +
      "export async function POST(req: Request) {\n" +
      '  const signature = req.headers.get("stripe-signature")!;\n' +
      '  const stripe = new Stripe("sk");\n' +
      "  const event = stripe.webhooks.constructEvent(await req.text(), signature, \"whsec\");\n" +
      "  return new Response('ok');\n" +
      "}\n"
  );
  fs.writeFileSync(
    path.join(dir, "supabase/migrations", "0001_init.sql"),
    "create table if not exists widgets (id uuid primary key, owner_id uuid not null);\n" +
      "alter table widgets enable row level security;\n" +
      "create policy widgets_select_own on widgets for select using (owner_id = auth.uid());\n"
  );
  fs.writeFileSync(
    path.join(dir, "lib", "rate-limit.ts"),
    'const generateLimiter = new Ratelimit({ prefix: "rl:generate" });\n' +
      "export async function rateLimit(key: string) { return true; }\n"
  );

  return dir;
}

function runGate(dir: string): { status: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(TSX_BIN, [GATE_SCRIPT], {
      cwd: dir,
      encoding: "utf8",
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status: number | null; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("security-baseline-check CLI (end to end)", () => {
  it("exits 0 on a fully-compliant tree", () => {
    const dir = makeTempRepo();
    const result = runGate(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  }, 30_000);

  it("exits 1 when the webhook route has no signature verification", () => {
    const dir = makeTempRepo();
    fs.writeFileSync(
      path.join(dir, "app/api/stripe/webhook/route.ts"),
      "export async function POST(req: Request) {\n" +
        '  const signature = req.headers.get("stripe-signature");\n' +
        "  // BUG: signature is read but never verified against anything.\n" +
        "  const event = JSON.parse(await req.text());\n" +
        "  return new Response('ok');\n" +
        "}\n"
    );

    const result = runGate(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("webhook-signature-missing");
    expect(result.stderr).toContain("FAIL");
  }, 30_000);

  it("exits 1 when NO file anywhere references stripe-signature / stripe.webhooks (whole route deleted)", () => {
    const dir = makeTempRepo();
    fs.rmSync(path.join(dir, "app/api/stripe/webhook/route.ts"));

    const result = runGate(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("webhook-signature-missing");
  }, 30_000);

  it("exits 1 when RLS is enabled but no non-permissive policy targets the table", () => {
    const dir = makeTempRepo();
    fs.writeFileSync(
      path.join(dir, "supabase/migrations", "0002_no_policy.sql"),
      "create table if not exists secrets (id uuid primary key);\n" +
        "alter table secrets enable row level security;\n"
    );

    const result = runGate(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("rls-missing");
    expect(result.stderr).toContain("secrets");
  }, 30_000);

  it("exits 1 when a migration declares a storage bucket with no explicit public flag and no storage.objects policy", () => {
    const dir = makeTempRepo();
    fs.writeFileSync(
      path.join(dir, "supabase/migrations", "0003_bucket.sql"),
      "insert into storage.buckets (id, name) values ('avatars', 'avatars');\n"
    );

    const result = runGate(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no-storage-bucket-policy");
    expect(result.stderr).toContain("avatars");
  }, 30_000);

  it("stays green when a migration declares a storage bucket WITH an explicit public flag and a scoped policy", () => {
    const dir = makeTempRepo();
    fs.writeFileSync(
      path.join(dir, "supabase/migrations", "0003_bucket.sql"),
      "insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false);\n\n" +
        'create policy "avatars_tenant_isolation" on storage.objects for all using (bucket_id = \'avatars\');\n'
    );

    const result = runGate(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  }, 30_000);

  it("exits 1 when a migration creates a table with no RLS enabled anywhere", () => {
    const dir = makeTempRepo();
    fs.writeFileSync(
      path.join(dir, "supabase/migrations", "0002_leaky.sql"),
      "create table if not exists leaky_table (id uuid primary key, secret text);\n"
    );

    const result = runGate(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("rls-missing");
    expect(result.stderr).toContain("leaky_table");
  }, 30_000);

  it("exits 1 when an AI endpoint route has no rate-limit wiring", () => {
    const dir = makeTempRepo();
    fs.mkdirSync(path.join(dir, "app/api/projects/x/generate-blueprint"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, "app/api/projects/x/generate-blueprint/route.ts"),
      "export async function POST(req: Request) {\n  return new Response('ok');\n}\n"
    );

    const result = runGate(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ai-endpoint-no-rate-limit");
  }, 30_000);

  it("exits 1 when lib/rate-limit.ts has no AI/generation-scoped bucket", () => {
    const dir = makeTempRepo();
    fs.writeFileSync(
      path.join(dir, "lib", "rate-limit.ts"),
      "export async function rateLimit(key: string) { return true; }\n"
    );

    const result = runGate(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("rate-limit-module-missing-ai-bucket");
  }, 30_000);

  it("exits 2 (gate failure, not silent success) when supabase/migrations does not exist", () => {
    const dir = makeTempRepo();
    fs.rmSync(path.join(dir, "supabase"), { recursive: true, force: true });

    const result = runGate(dir);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("ERROR");
  }, 30_000);
});
