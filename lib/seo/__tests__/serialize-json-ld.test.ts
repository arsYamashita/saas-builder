import { describe, it, expect } from "vitest";
import { serializeJsonLd } from "../serialize-json-ld";

describe("serializeJsonLd", () => {
  it("escapes </script> so a script-closing tag cannot be smuggled in a string value", () => {
    const payload = { description: "</script><script>alert(1)</script>" };
    const serialized = serializeJsonLd(payload);

    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
  });

  it("escapes an HTML comment opener that could be used to break out of the script context", () => {
    const payload = { description: "<!--<script>alert(1)</script>-->" };
    const serialized = serializeJsonLd(payload);

    expect(serialized).not.toContain("<!--");
    expect(serialized).not.toContain("<script>");
  });

  it("escapes U+2028 LINE SEPARATOR so it cannot terminate a JS string literal", () => {
    const payload = { description: "line1\u2028line2" };
    const serialized = serializeJsonLd(payload);

    expect(serialized).not.toContain("\u2028");
    expect(serialized).toContain("\\u2028");
  });

  it("escapes U+2029 PARAGRAPH SEPARATOR so it cannot terminate a JS string literal", () => {
    const payload = { description: "line1\u2029line2" };
    const serialized = serializeJsonLd(payload);

    expect(serialized).not.toContain("\u2029");
    expect(serialized).toContain("\\u2029");
  });

  it("still produces valid JSON once un-escaped by the browser/HTML parser (round-trips)", () => {
    const payload = {
      "@type": "SoftwareApplication",
      name: "SaaS Builder",
      description: "</script><script>alert(document.cookie)</script>",
    };
    const serialized = serializeJsonLd(payload);

    // The browser HTML parser only strips the \u003c escape back to `<` when
    // it decodes the JS string literal at runtime -- JSON.parse on the raw
    // escaped text itself should still succeed since \uXXXX is valid JSON
    // string escape syntax too.
    expect(() => JSON.parse(serialized)).not.toThrow();
    expect(JSON.parse(serialized)).toEqual(payload);
  });

  it("does not alter data with no special characters", () => {
    const payload = { name: "SaaS Builder", version: "1.0" };
    expect(serializeJsonLd(payload)).toBe(JSON.stringify(payload));
  });
});
