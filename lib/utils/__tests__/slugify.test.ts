import { describe, it, expect } from "vitest";
import { slugify } from "../slugify";

describe("slugify", () => {
  it("lowercases input", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("foo bar baz")).toBe("foo-bar-baz");
  });

  it("replaces special characters", () => {
    expect(slugify("hello@world!")).toBe("hello-world");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("trims whitespace", () => {
    expect(slugify("  hello  ")).toBe("hello");
  });

  it("collapses consecutive non-alphanumeric to single hyphen", () => {
    expect(slugify("a---b")).toBe("a-b");
  });

  it("truncates to 50 characters", () => {
    const long = "a".repeat(60);
    expect(slugify(long)).toHaveLength(50);
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles numbers", () => {
    expect(slugify("Item 42")).toBe("item-42");
  });
});
