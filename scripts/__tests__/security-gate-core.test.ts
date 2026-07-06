import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  scanSourceFiles,
  findSilentErrorPatternViolations,
  findStripeDirectCallViolations,
  findMigrationViewViolations,
  isClientComponent,
  stripComments,
  stripSqlComments,
  type SourceFile,
} from "../security-gate-core";

const FIXTURES_DIR = path.join(__dirname, "fixtures", "security-gate");

/** Loads a fixture file's real content, with an overridable logical `path`. */
function loadFixture(name: string, overridePath?: string): SourceFile {
  const content = fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8");
  return { path: overridePath ?? `app/api/fixture/${name}`, content };
}

describe("security-gate-core: silent error pattern violations", () => {
  it("flags `.catch(() => ({}))` in a server route handler", () => {
    const file = loadFixture("bad-silent-catch-empty-object.ts");
    const violations = findSilentErrorPatternViolations([file]);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("no-silent-catch");
    expect(violations[0].file).toBe(file.path);
  });

  it("flags `.catch(() => {})` in server-side code", () => {
    const file = loadFixture("bad-silent-catch-empty-block.ts");
    const violations = findSilentErrorPatternViolations([file]);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("no-silent-catch");
  });

  it("flags `details: <expr>.message` error-detail leaks", () => {
    const file = loadFixture("bad-error-detail-leak.ts");
    const violations = findSilentErrorPatternViolations([file]);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("no-error-detail-leak");
  });

  it("does NOT flag the same substrings when they appear only in a doc comment", () => {
    const file = loadFixture("good-documented-anti-pattern.ts");
    const violations = findSilentErrorPatternViolations([file]);
    expect(violations).toEqual([]);
  });

  it("does NOT flag a Client Component parsing its own fetch() response", () => {
    const file = loadFixture("good-client-component-fetch.tsx");
    expect(isClientComponent(file.content)).toBe(true);
    const violations = findSilentErrorPatternViolations([file]);
    expect(violations).toEqual([]);
  });

  it("reports the correct 1-indexed line number", () => {
    const file = loadFixture("bad-silent-catch-empty-block.ts");
    const violations = findSilentErrorPatternViolations([file]);
    const lines = file.content.split("\n");
    expect(lines[violations[0].line - 1]).toContain(".catch(() => {})");
  });
});

describe("security-gate-core: stripe direct-call violations", () => {
  it("flags a direct stripe.checkout.sessions.create() call outside packages/payments/", () => {
    const file = loadFixture(
      "bad-stripe-checkout-bypass.ts",
      "app/api/billing/checkout/route.ts"
    );
    const violations = findStripeDirectCallViolations([file]);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("no-stripe-bypass");
  });

  it("flags a direct stripe.webhooks.constructEvent() call outside packages/payments/", () => {
    const file = loadFixture(
      "bad-stripe-webhook-bypass.ts",
      "app/api/stripe/webhook/route.ts"
    );
    const violations = findStripeDirectCallViolations([file]);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("no-stripe-bypass");
  });

  it("does NOT flag the same direct call INSIDE packages/payments/", () => {
    const file = loadFixture(
      "good-payments-package-direct-call.ts",
      "packages/payments/src/checkout.ts"
    );
    const violations = findStripeDirectCallViolations([file]);
    expect(violations).toEqual([]);
  });
});

describe("security-gate-core: scanSourceFiles (combined)", () => {
  it("aggregates violations across all fixture files and is clean on all 'good' fixtures", () => {
    const badFiles = [
      loadFixture("bad-silent-catch-empty-object.ts"),
      loadFixture("bad-silent-catch-empty-block.ts"),
      loadFixture("bad-error-detail-leak.ts"),
      loadFixture(
        "bad-stripe-checkout-bypass.ts",
        "app/api/billing/checkout/route.ts"
      ),
      loadFixture(
        "bad-stripe-webhook-bypass.ts",
        "app/api/stripe/webhook/route.ts"
      ),
    ];
    const goodFiles = [
      loadFixture("good-client-component-fetch.tsx"),
      loadFixture("good-documented-anti-pattern.ts"),
      loadFixture(
        "good-payments-package-direct-call.ts",
        "packages/payments/src/checkout.ts"
      ),
    ];

    expect(scanSourceFiles(badFiles).length).toBeGreaterThanOrEqual(
      badFiles.length
    );
    expect(scanSourceFiles(goodFiles)).toEqual([]);
  });
});

describe("security-gate-core: migration security_invoker violations", () => {
  it("flags a new CREATE VIEW migration with no security_invoker", () => {
    const file = loadFixture(
      "bad-migration-view-no-invoker.sql",
      "supabase/migrations/0099_bad_view.sql"
    );
    const violations = findMigrationViewViolations([file]);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("no-view-without-security-invoker");
  });

  it("does NOT flag a CREATE VIEW migration that sets security_invoker = true", () => {
    const file = loadFixture(
      "good-migration-view-with-invoker.sql",
      "supabase/migrations/0100_good_view.sql"
    );
    const violations = findMigrationViewViolations([file]);
    expect(violations).toEqual([]);
  });

  it("does NOT flag a migration with no CREATE VIEW at all", () => {
    const file: SourceFile = {
      path: "supabase/migrations/0101_add_column.sql",
      content: "ALTER TABLE public.contents ADD COLUMN archived boolean DEFAULT false;",
    };
    expect(findMigrationViewViolations([file])).toEqual([]);
  });

  // Codex review (PR #36, P2) regression cases: the check must be
  // per-view and comment-aware, not a whole-file substring test.

  it("flags the UNCOVERED view when a multi-view migration protects only the first (P2 case 1)", () => {
    const file = loadFixture(
      "bad-migration-multi-view-partial-invoker.sql",
      "supabase/migrations/0102_two_views.sql"
    );
    const violations = findMigrationViewViolations([file]);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("no-view-without-security-invoker");
    // The covered view (contents_published) must NOT be flagged; the
    // uncovered one (contents_drafts) must be named in the message.
    expect(violations[0].message).toContain("contents_drafts");
    expect(violations[0].message).not.toContain("contents_published");
    // Line number points at the second CREATE VIEW, not the first.
    const lines = file.content.split("\n");
    expect(lines[violations[0].line - 1]).toContain("contents_drafts");
  });

  it("flags a view whose only security_invoker mention is inside comments (P2 case 2)", () => {
    const file = loadFixture(
      "bad-migration-comment-only-invoker.sql",
      "supabase/migrations/0103_comment_only.sql"
    );
    const violations = findMigrationViewViolations([file]);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe("no-view-without-security-invoker");
    expect(violations[0].message).toContain("contents_published");
  });

  it("passes a multi-view migration where EVERY view is covered — inline WITH and ALTER, schema-qualified or not (P2 case 3)", () => {
    const file = loadFixture(
      "good-migration-multi-view-all-invoker.sql",
      "supabase/migrations/0104_two_views_ok.sql"
    );
    // Fixture deliberately mixes coverage styles: view 1 inline
    // `WITH (security_invoker = true)`, view 2 created UNqualified
    // (`contents_drafts`) but altered qualified (`public.contents_drafts`).
    expect(findMigrationViewViolations([file])).toEqual([]);
  });

  it("does not let one covered view name vouch for a different view", () => {
    const file: SourceFile = {
      path: "supabase/migrations/0105_mismatched_alter.sql",
      content: [
        "CREATE VIEW public.reports AS SELECT id FROM public.contents;",
        "ALTER VIEW public.other_view SET (security_invoker = true);",
      ].join("\n"),
    };
    const violations = findMigrationViewViolations([file]);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain("public.reports");
  });
});

describe("security-gate-core: stripSqlComments", () => {
  it("blanks out -- line comments and /* */ block comments, preserving line count", () => {
    const input = [
      "CREATE TABLE t (id int); -- security_invoker = true",
      "/* CREATE VIEW fake AS",
      "   security_invoker = true */",
      "SELECT 1;",
    ].join("\n");
    const out = stripSqlComments(input);
    expect(out.split("\n")).toHaveLength(4);
    expect(out).not.toContain("security_invoker");
    expect(out).not.toContain("fake");
    expect(out).toContain("CREATE TABLE t (id int);");
    expect(out).toContain("SELECT 1;");
  });
});

describe("security-gate-core: stripComments", () => {
  it("blanks out block comments while preserving line count", () => {
    const input = "const a = 1;\n/* comment\nspans two lines */\nconst b = 2;";
    const out = stripComments(input);
    expect(out.split("\n")).toHaveLength(input.split("\n").length);
    expect(out).not.toContain("comment");
    expect(out).toContain("const a = 1;");
    expect(out).toContain("const b = 2;");
  });

  it("strips line comments without touching code before them", () => {
    const input = 'const url = "https://example.com"; // details: e.message';
    const out = stripComments(input);
    expect(out).toContain('const url = "https://example.com";');
    expect(out).not.toContain("details:");
  });
});
