import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseResolvesKbTrailers,
  extractPrNumber,
  dedupeByFile,
} from "../kb-reconcile-core";

describe("parseResolvesKbTrailers", () => {
  it("extracts a single trailer file", () => {
    const body = `## Summary\n\nFixes the thing.\n\nResolves-KB: stripe_checkout_idempotency_key_missing.md\n`;
    expect(parseResolvesKbTrailers(body)).toEqual([
      "stripe_checkout_idempotency_key_missing.md",
    ]);
  });

  it("normalizes a missing .md suffix", () => {
    const body = `Resolves-KB: some_pattern\n`;
    expect(parseResolvesKbTrailers(body)).toEqual(["some_pattern.md"]);
  });

  it("supports multiple files on one trailer line, comma or whitespace separated", () => {
    const body = `Resolves-KB: a.md, b.md c.md\n`;
    expect(parseResolvesKbTrailers(body)).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("supports multiple trailer lines and de-duplicates", () => {
    const body = `Resolves-KB: a.md\nResolves-KB: a.md\nResolves-KB: b.md\n`;
    expect(parseResolvesKbTrailers(body)).toEqual(["a.md", "b.md"]);
  });

  it("is case-insensitive on the trailer key", () => {
    const body = `resolves-kb: a.md\n`;
    expect(parseResolvesKbTrailers(body)).toEqual(["a.md"]);
  });

  it("returns an empty array when there is no trailer", () => {
    expect(parseResolvesKbTrailers("## Summary\n\nNothing here.\n")).toEqual([]);
  });

  it("ignores trailers inside multi-line HTML comments (PR template default body)", () => {
    // Regression: Codex review P2 on PR #29. A PR opened from the
    // untouched default .github/PULL_REQUEST_TEMPLATE.md must not
    // "resolve" anything just because the template's explanatory
    // comment mentions the trailer format.
    const body = `## Resolves-KB

<!--
If this PR fixes a KB pattern, add trailer lines below. Example:

Resolves-KB: stripe_checkout_idempotency_key_missing.md
-->

## Test Plan
`;
    expect(parseResolvesKbTrailers(body)).toEqual([]);
  });

  it("ignores single-line HTML-commented trailers too", () => {
    const body = `<!-- Resolves-KB: a.md -->\n`;
    expect(parseResolvesKbTrailers(body)).toEqual([]);
  });

  it("still picks up real trailers outside HTML comments in the same body", () => {
    const body = `## Resolves-KB

<!--
Explanatory comment mentioning the format:
Resolves-KB: fake_example_from_template.md
-->
Resolves-KB: real_pattern.md

<!-- another comment -->
Resolves-KB: second_real_pattern.md
`;
    expect(parseResolvesKbTrailers(body)).toEqual([
      "real_pattern.md",
      "second_real_pattern.md",
    ]);
  });

  it("treats an unterminated HTML comment as commented-out to the end (matches GitHub rendering)", () => {
    const body = `Resolves-KB: before_comment.md\n<!-- oops, never closed\nResolves-KB: swallowed.md\n`;
    expect(parseResolvesKbTrailers(body)).toEqual(["before_comment.md"]);
  });

  it("the repo's actual PR template yields zero trailers (defense layer 2)", () => {
    // Both defenses must hold independently: even if the comment-stripping
    // above were removed, the template text itself must not contain a
    // line the trailer regex would match.
    const template = fs.readFileSync(
      path.join(__dirname, "..", "..", ".github", "PULL_REQUEST_TEMPLATE.md"),
      "utf8"
    );
    expect(parseResolvesKbTrailers(template)).toEqual([]);
    // layer 2 on its own: strip nothing, the raw text still has no
    // parseable `Resolves-KB:` trailer line.
    expect(template).not.toMatch(/^\s*Resolves-KB:/im);
  });
});

describe("extractPrNumber", () => {
  it("extracts from a squash-merge subject", () => {
    expect(extractPrNumber("fix(payments): add idempotency key (#27)")).toBe("27");
  });

  it("extracts from a merge-commit subject", () => {
    expect(
      extractPrNumber("Merge pull request #27 from arsYamashita/m5/foo")
    ).toBe("27");
  });

  it("returns undefined for a plain commit subject", () => {
    expect(extractPrNumber("fix(payments): add idempotency key")).toBeUndefined();
  });
});

describe("dedupeByFile", () => {
  it("keeps one entry per file, later records winning", () => {
    const result = dedupeByFile([
      { files: ["a.md"], prNumber: "10", date: "2026-01-01", source: "git-log:abc" },
      { files: ["a.md", "b.md"], prNumber: "27", date: "2026-07-03", source: "gh-pr:#27" },
    ]);

    expect(result.get("a.md")).toEqual({
      prNumber: "27",
      date: "2026-07-03",
      source: "gh-pr:#27",
    });
    expect(result.get("b.md")).toEqual({
      prNumber: "27",
      date: "2026-07-03",
      source: "gh-pr:#27",
    });
  });
});
