import { describe, it, expect } from "vitest";
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
