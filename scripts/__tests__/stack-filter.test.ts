import { describe, it, expect } from "vitest";
import { matchesStack, normalizeStackList, STACK_TAGS, ALL_PLATFORM_TAGS } from "../stack-filter";

describe("normalizeStackList", () => {
  it("splits a comma-separated string and lowercases", () => {
    expect(normalizeStackList("NextJS, Supabase")).toEqual(["nextjs", "supabase"]);
  });

  it("accepts an array directly", () => {
    expect(normalizeStackList(["Flutter", "Firebase"])).toEqual(["flutter", "firebase"]);
  });

  it("returns [] for undefined/null/empty", () => {
    expect(normalizeStackList(undefined)).toEqual([]);
    expect(normalizeStackList(null)).toEqual([]);
    expect(normalizeStackList("")).toEqual([]);
  });
});

describe("matchesStack", () => {
  it("no stacks requested -> matches everything", () => {
    expect(matchesStack(["ios", "swift"], [])).toBe(true);
  });

  it("item tag directly in requested stack -> match", () => {
    expect(matchesStack(["error", "pattern", "supabase", "rls"], ["supabase"])).toBe(true);
  });

  it("item tag belongs to a different, unrequested platform -> no match", () => {
    expect(matchesStack(["error", "pattern", "ios", "swift"], ["nextjs"])).toBe(false);
  });

  it("item has no platform-signaling tag at all -> always matches (universal)", () => {
    expect(matchesStack(["error", "pattern", "security", "credentials"], ["nextjs"])).toBe(true);
    expect(matchesStack(["error", "pattern", "security", "credentials"], ["flutter"])).toBe(true);
  });

  it("unrecognized stack name is matched as a raw tag", () => {
    expect(matchesStack(["error", "pattern", "anthropic", "sdk"], ["anthropic"])).toBe(true);
  });

  it("STACK_TAGS and ALL_PLATFORM_TAGS stay consistent", () => {
    for (const tags of Object.values(STACK_TAGS)) {
      for (const tag of tags) {
        expect(ALL_PLATFORM_TAGS.has(tag)).toBe(true);
      }
    }
  });
});
