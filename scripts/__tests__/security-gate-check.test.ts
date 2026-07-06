import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * End-to-end test of `scripts/security-gate-check.ts` (the CLI wrapper,
 * not just the pure `security-gate-core.ts` functions unit-tested in
 * scripts/__tests__/security-gate-core.test.ts).
 *
 * Builds a disposable throwaway git repo per test (app/lib/packages +
 * supabase/migrations + a real `git init` history) and runs the actual
 * script against it via child_process, so this proves the exit-code
 * contract end to end: 0 = clean, 1 = real violation found, 2 = the gate's
 * own tooling failed (bad base ref) — see security-gate-check.ts's header
 * comment and [[auto_scan_output_empty_silent_success]].
 *
 * `SECURITY_GATE_BASE_REF` lets these tests point the migration-diff step
 * at a plain local commit instead of requiring a real "origin" remote.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TSX_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
const GATE_SCRIPT = path.join(REPO_ROOT, "scripts", "security-gate-check.ts");

const tempDirs: string[] = [];

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "security-gate-test-"));
  tempDirs.push(dir);

  for (const sub of ["app", "lib", "packages", "supabase/migrations"]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }

  execFileSync("git", ["init", "--initial-branch=main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: dir,
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });

  // A clean baseline file + one pre-existing migration, so
  // collectSourceFiles() never sees an empty tree and the "new migrations"
  // diff has a real base commit to compare against.
  fs.writeFileSync(
    path.join(dir, "lib", "clean.ts"),
    'export function ok() { return "fine"; }\n'
  );
  fs.writeFileSync(
    path.join(dir, "supabase/migrations", "0001_init.sql"),
    "CREATE TABLE public.widgets (id uuid PRIMARY KEY);\n"
  );
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "base"], { cwd: dir });

  return dir;
}

function commitAll(dir: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-m", message], { cwd: dir });
}

function runGate(
  dir: string,
  baseRef: string
): { status: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(TSX_BIN, [GATE_SCRIPT], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, SECURITY_GATE_BASE_REF: baseRef },
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

describe("security-gate-check CLI (end to end)", () => {
  it("exits 0 on a clean tree with no new migrations", () => {
    const dir = makeTempRepo();
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    }).trim();

    const result = runGate(dir, baseSha);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  }, 30_000);

  it("exits 1 when a route handler swallows a parse failure via .catch(() => ({}))", () => {
    const dir = makeTempRepo();
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    }).trim();

    fs.mkdirSync(path.join(dir, "app/api/widgets"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "app/api/widgets/route.ts"),
      'export async function POST(req: Request) {\n  const body = await req.json().catch(() => ({}));\n  return new Response(JSON.stringify(body));\n}\n'
    );
    commitAll(dir, "add violating route");

    const result = runGate(dir, baseSha);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no-silent-catch");
    expect(result.stderr).toContain("FAIL");
  }, 30_000);

  it("exits 1 when a NEW migration creates a VIEW without security_invoker", () => {
    const dir = makeTempRepo();
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    }).trim();

    fs.writeFileSync(
      path.join(dir, "supabase/migrations", "0002_widgets_view.sql"),
      "CREATE VIEW public.widgets_public AS SELECT id FROM public.widgets;\n"
    );
    commitAll(dir, "add view migration without security_invoker");

    const result = runGate(dir, baseSha);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no-view-without-security-invoker");
  }, 30_000);

  it("does NOT flag a pre-existing (already-committed) VIEW migration as new", () => {
    const dir = makeTempRepo();

    // The view migration is part of the BASE commit itself, so a diff
    // against that same base commit must report it as 0 new files.
    fs.writeFileSync(
      path.join(dir, "supabase/migrations", "0002_widgets_view.sql"),
      "CREATE VIEW public.widgets_public AS SELECT id FROM public.widgets;\n"
    );
    commitAll(dir, "pre-existing view migration");
    const baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    }).trim();

    const result = runGate(dir, baseSha);
    expect(result.status).toBe(0);
  }, 30_000);

  it("exits 2 (gate failure, not silent success) when the base ref cannot be resolved", () => {
    const dir = makeTempRepo();

    const result = runGate(dir, "this-ref-does-not-exist");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("ERROR");
  }, 30_000);
});
