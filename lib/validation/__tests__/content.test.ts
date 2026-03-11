import { describe, it, expect } from "vitest";
import { contentFormSchema } from "../content";

describe("contentFormSchema", () => {
  it("accepts valid minimal input", () => {
    const result = contentFormSchema.safeParse({ title: "Test" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Test");
      expect(result.data.body).toBe("");
      expect(result.data.content_type).toBe("article");
      expect(result.data.visibility).toBe("members");
      expect(result.data.published).toBe(false);
    }
  });

  it("accepts full input", () => {
    const result = contentFormSchema.safeParse({
      title: "Full Content",
      body: "Some body text",
      content_type: "video",
      visibility: "public",
      published: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Full Content");
      expect(result.data.body).toBe("Some body text");
      expect(result.data.content_type).toBe("video");
      expect(result.data.visibility).toBe("public");
      expect(result.data.published).toBe(true);
    }
  });

  it("rejects empty title", () => {
    const result = contentFormSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "タイトルを入力してください"
      );
    }
  });

  it("rejects missing title", () => {
    const result = contentFormSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects null title", () => {
    const result = contentFormSchema.safeParse({ title: null });
    expect(result.success).toBe(false);
  });

  it("rejects non-string title", () => {
    const result = contentFormSchema.safeParse({ title: 123 });
    expect(result.success).toBe(false);
  });

  it("accepts empty body", () => {
    const result = contentFormSchema.safeParse({ title: "T", body: "" });
    expect(result.success).toBe(true);
  });

  it("defaults body to empty string when omitted", () => {
    const result = contentFormSchema.safeParse({ title: "T" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).toBe("");
    }
  });

  it("rejects empty content_type", () => {
    const result = contentFormSchema.safeParse({
      title: "T",
      content_type: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty visibility", () => {
    const result = contentFormSchema.safeParse({
      title: "T",
      visibility: "",
    });
    expect(result.success).toBe(false);
  });
});
