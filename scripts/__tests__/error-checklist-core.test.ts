import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildChecklist,
  categorize,
  extractTitle,
  parseFrontmatter,
} from "../error-checklist-core";

function writeFixture(dir: string, name: string, content: string): string {
  const full = path.join(dir, name);
  fs.writeFileSync(full, content, "utf8");
  return full;
}

const STRIPE_PATTERN = `---
type: error_pattern
severity: critical
projects: [saas-builder, aria-for-salon-app]
resolved: false
created: 2026-04-03
tags: [error, pattern, stripe, webhook, security]
---

# エラーパターン: Stripe Webhook 署名検証未実装

## 症状
Something bad happens.
`;

const RLS_PATTERN = `---
type: error_pattern
severity: critical
projects: [saas-builder]
resolved: true
created: 2026-03-30
tags: [error, pattern, security, supabase, rls]
---

# エラーパターン: Supabase RLS ポリシー未設定
`;

const IDEMPOTENCY_PATTERN = `---
type: error_pattern
severity: high
projects: [saas-builder]
resolved: false
created: 2026-05-26
tags: [error, pattern, idempotency, affiliate, stripe, webhook, duplicate]
---

# エラーパターン: アフィリエイトコミッション生成の冪等性欠落
`;

const RATE_LIMIT_PATTERN = `---
type: error_pattern
severity: high
projects: [saas-builder]
resolved: false
created: 2026-05-01
tags: [error, pattern, rate-limit, serverless]
---

# エラーパターン: サーバーレス環境でのインメモリレート制限
`;

const OTHER_PATTERN = `---
type: error_pattern
severity: medium
projects: [ai-app-builder]
resolved: false
created: 2026-05-01
tags: [error, pattern, android, gradle]
---

# エラーパターン: Android ビルドツールチェーン古い
`;

const NON_PATTERN_LOG = `既存41パターンとプロジェクトスタックを照合した結果、1件の新規パターンを検出しました。

---

新規パターンなし
`;

describe("parseFrontmatter", () => {
  it("parses scalar, array, and boolean fields", () => {
    const fm = parseFrontmatter(STRIPE_PATTERN);
    expect(fm).not.toBeNull();
    expect(fm?.type).toBe("error_pattern");
    expect(fm?.severity).toBe("critical");
    expect(fm?.resolved).toBe(false);
    expect(fm?.projects).toEqual(["saas-builder", "aria-for-salon-app"]);
    expect(fm?.tags).toEqual(["error", "pattern", "stripe", "webhook", "security"]);
  });

  it("returns null for content without a leading frontmatter block", () => {
    expect(parseFrontmatter(NON_PATTERN_LOG)).toBeNull();
  });
});

describe("extractTitle", () => {
  it("extracts the first H1 after frontmatter", () => {
    expect(extractTitle(STRIPE_PATTERN)).toBe(
      "エラーパターン: Stripe Webhook 署名検証未実装"
    );
  });
});

describe("categorize", () => {
  it("classifies stripe/payments tags", () => {
    expect(categorize(["stripe", "webhook"])).toBe("Stripe / Payments");
  });

  it("classifies supabase/rls tags", () => {
    expect(categorize(["supabase", "rls"])).toBe("Supabase / RLS");
  });

  it("classifies idempotency/race tags ahead of stripe when both present", () => {
    // affiliate_commission_idempotency_missing.md is tagged with both
    // "idempotency" and "stripe" — idempotency is the more specific bucket.
    expect(categorize(["idempotency", "affiliate", "stripe"])).toBe(
      "Idempotency / Race Conditions"
    );
  });

  it("classifies rate-limit/env tags", () => {
    expect(categorize(["rate-limit", "serverless"])).toBe(
      "Rate Limit / Env Validation"
    );
  });

  it("falls back to Other for unmatched tags", () => {
    expect(categorize(["android", "gradle"])).toBe("Other");
  });
});

describe("buildChecklist", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-checklist-test-"));
    fs.mkdirSync(path.join(dir, "30_Knowledge", "errors"), {
      recursive: true,
    });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function errorsDir() {
    return path.join(dir, "30_Knowledge", "errors");
  }

  it("groups entries into categories and ignores non-pattern files", () => {
    writeFixture(errorsDir(), "stripe_webhook_signature_missing.md", STRIPE_PATTERN);
    writeFixture(errorsDir(), "supabase_rls_missing.md", RLS_PATTERN);
    writeFixture(
      errorsDir(),
      "affiliate_commission_idempotency_missing.md",
      IDEMPOTENCY_PATTERN
    );
    writeFixture(errorsDir(), "serverless_inmemory_ratelimit.md", RATE_LIMIT_PATTERN);
    writeFixture(errorsDir(), "android_build_toolchain_outdated.md", OTHER_PATTERN);
    writeFixture(errorsDir(), "auto_scan_2026-04-02.md", NON_PATTERN_LOG);

    const warn = vi.fn();
    const result = buildChecklist(dir, warn);

    expect(result.items).toHaveLength(5);
    expect(result.ignoredNonPattern).toBe(1);
    expect(result.skipped).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();

    expect(result.markdown).toContain("## Stripe / Payments (1)");
    expect(result.markdown).toContain("## Supabase / RLS (1)");
    expect(result.markdown).toContain("## Idempotency / Race Conditions (1)");
    expect(result.markdown).toContain("## Rate Limit / Env Validation (1)");
    expect(result.markdown).toContain("## Other (1)");
    expect(result.markdown).toContain("stripe_webhook_signature_missing");
  });

  it("skips unreadable files (e.g. EDEADLK) with a warning instead of throwing", () => {
    writeFixture(errorsDir(), "stripe_webhook_signature_missing.md", STRIPE_PATTERN);
    writeFixture(errorsDir(), "locked_file.md", RLS_PATTERN);

    const realReadFileSync = fs.readFileSync;
    vi.spyOn(fs, "readFileSync").mockImplementation((filePath, options) => {
      if (String(filePath).endsWith("locked_file.md")) {
        const err = new Error(
          "EDEADLK: resource deadlock avoided, read"
        ) as NodeJS.ErrnoException;
        err.code = "EDEADLK";
        throw err;
      }
      return realReadFileSync(filePath as any, options as any);
    });

    const warn = vi.fn();
    const result = buildChecklist(dir, warn);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].slug).toBe("stripe_webhook_signature_missing");
    expect(result.skipped).toEqual([
      { file: "locked_file.md", reason: "EDEADLK" },
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("EDEADLK")
    );
    expect(result.markdown).toContain("EDEADLK");
  });

  it("returns zero items (caller decides to fail) when the errors dir has no valid patterns", () => {
    writeFixture(errorsDir(), "auto_scan_2026-04-02.md", NON_PATTERN_LOG);

    const result = buildChecklist(dir, vi.fn());

    expect(result.items).toHaveLength(0);
  });

  it("returns zero items and warns when the errors directory does not exist", () => {
    const missingVault = path.join(dir, "does-not-exist");
    const warn = vi.fn();

    const result = buildChecklist(missingVault, warn);

    expect(result.items).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("cannot read errors directory")
    );
  });

  it("sorts unresolved-before-resolved and by severity within a category", () => {
    writeFixture(errorsDir(), "supabase_rls_missing.md", RLS_PATTERN); // resolved: true, critical
    const unresolvedCritical = STRIPE_PATTERN.replace(
      "severity: critical",
      "severity: critical"
    );
    writeFixture(
      errorsDir(),
      "stripe_webhook_signature_missing.md",
      unresolvedCritical
    ); // resolved: false, critical

    const result = buildChecklist(dir, vi.fn());
    const slugs = result.items.map((i) => i.slug);

    // unresolved item should sort before the resolved one
    expect(slugs.indexOf("stripe_webhook_signature_missing")).toBeLessThan(
      slugs.indexOf("supabase_rls_missing")
    );
  });
});
