import { describe, it, expect } from "vitest";
import {
  resolveFinalPromptPath,
  resolveTemplatePrefixPath,
  isSupportedTemplate,
} from "../template-prompt-resolver";

describe("resolveFinalPromptPath", () => {
  it("resolves blueprint prompt for membership_content_affiliate", () => {
    expect(resolveFinalPromptPath("membership_content_affiliate", "blueprint"))
      .toBe("final/01-blueprint-final.md");
  });

  it("resolves schema prompt for reservation_saas", () => {
    expect(resolveFinalPromptPath("reservation_saas", "schema"))
      .toBe("final/reservation_saas/02-schema-final.md");
  });

  it("resolves all prompt kinds", () => {
    const kinds = ["blueprint", "schema", "api", "ui", "file_split"] as const;
    for (const kind of kinds) {
      const path = resolveFinalPromptPath("membership_content_affiliate", kind);
      expect(path).toContain("final");
      expect(path).toMatch(/\.(md)$/);
    }
  });

  it("throws for unsupported template key", () => {
    expect(() => resolveFinalPromptPath("nonexistent", "blueprint"))
      .toThrow(/Unsupported template_key/);
  });
});

describe("resolveTemplatePrefixPath", () => {
  it("resolves prefix for membership_content_affiliate", () => {
    expect(resolveTemplatePrefixPath("membership_content_affiliate"))
      .toBe("12-claude-membership-template-prefix.md");
  });

  it("resolves prefix for reservation_saas", () => {
    expect(resolveTemplatePrefixPath("reservation_saas"))
      .toBe("12-claude-reservation-saas-prefix.md");
  });

  it("resolves prefix for community_membership_saas", () => {
    expect(resolveTemplatePrefixPath("community_membership_saas"))
      .toBe("12-claude-community-membership-saas-prefix.md");
  });

  it("throws for unsupported key", () => {
    expect(() => resolveTemplatePrefixPath("bad_key")).toThrow(/Unsupported template_key/);
  });
});

describe("isSupportedTemplate", () => {
  it("returns true for valid templates", () => {
    expect(isSupportedTemplate("membership_content_affiliate")).toBe(true);
    expect(isSupportedTemplate("reservation_saas")).toBe(true);
    expect(isSupportedTemplate("community_membership_saas")).toBe(true);
    expect(isSupportedTemplate("simple_crm_saas")).toBe(true);
    expect(isSupportedTemplate("internal_admin_ops_saas")).toBe(true);
  });

  it("returns false for invalid templates", () => {
    expect(isSupportedTemplate("nonexistent")).toBe(false);
    expect(isSupportedTemplate("")).toBe(false);
  });
});
