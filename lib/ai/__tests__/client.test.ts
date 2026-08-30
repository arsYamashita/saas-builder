import { describe, it, expect } from "vitest";
import { MODELS } from "../client";

describe("MODELS", () => {
  it("uses the current-generation Anthropic model IDs (no dated snapshots for current-gen models)", () => {
    // claude-opus-5 is the current top-tier Anthropic model as of this
    // change. Per Anthropic's model-migration guidance, current-generation
    // model IDs are used bare (no date suffix); date-suffixed IDs
    // (e.g. `-20251001`) only apply where the SDK/pricing table still
    // requires a dated snapshot for a given tier.
    expect(MODELS.powerful).toBe("claude-opus-5");
  });

  it("does not use a retired/superseded Opus ID for the powerful tier", () => {
    expect(MODELS.powerful).not.toMatch(/^claude-opus-4-/);
  });
});
