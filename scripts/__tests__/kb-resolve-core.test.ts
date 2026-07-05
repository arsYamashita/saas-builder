import { describe, it, expect } from "vitest";
import { updateFrontmatterResolved } from "../kb-resolve-core";

const FLAT_UNRESOLVED = `---
type: error_pattern
severity: high
projects: [saas-builder]
resolved: false
created: 2026-05-25
tags: [error, pattern, stripe, payments, idempotency, duplicate-charge]
---

# エラーパターン: Stripe Checkout sessions.create() に idempotency key 未指定

## 症状
Retrying a client request can create a duplicate Checkout Session.

## 修正方法
Pass \`idempotencyKey\` to \`stripe.checkout.sessions.create()\`.
`;

const NESTED_UNRESOLVED = `---
name: llm_api_unbounded_text_input
description: LLM呼び出しAPI の Zod スキーマにテキスト長の上限がない
metadata:
  type: error_pattern
  severity: medium
  projects: [saas-builder, day_care_web_app]
  resolved: false
  created: 2026-05-28
  tags: [error, pattern, llm, validation, cost]
---

# エラーパターン: LLM API 入力テキスト長の上限未設定

## 症状
Something bad.
`;

const NO_FRONTMATTER = `既存41パターンとプロジェクトスタックを照合した結果、1件の新規パターンを検出しました。

---

新規パターンなし
`;

const UNTERMINATED_FRONTMATTER = `---
type: error_pattern
resolved: false

# no closing delimiter
`;

describe("updateFrontmatterResolved", () => {
  it("flips a flat resolved: false to true and adds resolved_by/resolved_at", () => {
    const result = updateFrontmatterResolved(FLAT_UNRESOLVED, {
      resolvedBy: "saas-builder#27",
      resolvedAt: "2026-07-06",
    });

    expect(result.changed).toBe(true);
    expect(result.content).toContain("resolved: true");
    expect(result.content).toContain('resolved_by: "saas-builder#27"');
    expect(result.content).toContain("resolved_at: 2026-07-06");
    expect(result.content).not.toContain("resolved: false");
  });

  it("leaves the Markdown body byte-for-byte unchanged", () => {
    const result = updateFrontmatterResolved(FLAT_UNRESOLVED, {
      resolvedBy: "saas-builder#27",
      resolvedAt: "2026-07-06",
    });

    const bodyBefore = FLAT_UNRESOLVED.slice(FLAT_UNRESOLVED.indexOf("\n---", 3) + 4);
    const bodyAfter = result.content.slice(result.content.indexOf("\n---", 3) + 4);
    expect(bodyAfter).toBe(bodyBefore);
  });

  it("preserves indentation for a resolved: key nested under metadata:", () => {
    const result = updateFrontmatterResolved(NESTED_UNRESOLVED, {
      resolvedBy: "saas-builder#30",
      resolvedAt: "2026-07-06",
    });

    expect(result.content).toContain("  resolved: true");
    expect(result.content).toContain('  resolved_by: "saas-builder#30"');
    expect(result.content).toContain("  resolved_at: 2026-07-06");
    // top-level keys (name/description) must not be touched or re-indented
    expect(result.content).toContain("name: llm_api_unbounded_text_input");
    // body (everything after the closing ---) is untouched
    expect(result.content).toContain(
      "# エラーパターン: LLM API 入力テキスト長の上限未設定"
    );
  });

  it("is idempotent: applying the same resolution twice is a no-op the second time", () => {
    const first = updateFrontmatterResolved(FLAT_UNRESOLVED, {
      resolvedBy: "saas-builder#27",
      resolvedAt: "2026-07-06",
    });
    const second = updateFrontmatterResolved(first.content, {
      resolvedBy: "saas-builder#27",
      resolvedAt: "2026-07-06",
    });

    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("re-running with a different resolvedBy overwrites it and reports the previous value", () => {
    const first = updateFrontmatterResolved(FLAT_UNRESOLVED, {
      resolvedBy: "saas-builder#27",
      resolvedAt: "2026-07-06",
    });
    const second = updateFrontmatterResolved(first.content, {
      resolvedBy: "saas-builder#31",
      resolvedAt: "2026-07-10",
    });

    expect(second.changed).toBe(true);
    expect(second.previousResolvedBy).toBe("saas-builder#27");
    expect(second.content).toContain('resolved_by: "saas-builder#31"');
    expect(second.content).toContain("resolved_at: 2026-07-10");
  });

  it("throws for content with no leading frontmatter delimiter", () => {
    expect(() =>
      updateFrontmatterResolved(NO_FRONTMATTER, {
        resolvedBy: "saas-builder#1",
        resolvedAt: "2026-07-06",
      })
    ).toThrow(/frontmatter/i);
  });

  it("throws for an unterminated frontmatter block", () => {
    expect(() =>
      updateFrontmatterResolved(UNTERMINATED_FRONTMATTER, {
        resolvedBy: "saas-builder#1",
        resolvedAt: "2026-07-06",
      })
    ).toThrow(/unterminated/i);
  });

  it("appends a resolved block when the file has frontmatter but no resolved: key at all", () => {
    const noResolvedKey = `---
type: error_pattern
severity: low
projects: [saas-builder]
created: 2026-01-01
---

# some pattern with no resolved key yet
`;
    const result = updateFrontmatterResolved(noResolvedKey, {
      resolvedBy: "saas-builder#5",
      resolvedAt: "2026-07-06",
    });

    expect(result.changed).toBe(true);
    expect(result.content).toContain("resolved: true");
    expect(result.content).toContain('resolved_by: "saas-builder#5"');
    expect(result.content).toContain("resolved_at: 2026-07-06");
    expect(result.content).toContain("# some pattern with no resolved key yet");
  });

  it("escapes embedded quotes in resolvedBy", () => {
    const result = updateFrontmatterResolved(FLAT_UNRESOLVED, {
      resolvedBy: 'saas-builder#27 (see "notes")',
      resolvedAt: "2026-07-06",
    });

    expect(result.content).toContain(
      'resolved_by: "saas-builder#27 (see \\"notes\\")"'
    );
  });
});
