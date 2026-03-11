import { describe, it, expect } from "vitest";
import {
  stripCodeFences,
  extractJsonFromText,
  parseFileBlocks,
  normalizeResult,
  validateNormalizedResult,
} from "../result-normalizer";
import type { ProviderRawResult } from "../provider-interface";

describe("stripCodeFences", () => {
  it("strips ```json ... ```", () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("strips ``` ... ```", () => {
    expect(stripCodeFences("```\nhello\n```")).toBe("hello");
  });

  it("returns text as-is if no fences", () => {
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}');
  });

  it("handles leading/trailing whitespace", () => {
    expect(stripCodeFences("  ```json\n{}\n```  ")).toBe("{}");
  });
});

describe("extractJsonFromText", () => {
  it("parses direct JSON", () => {
    const { data, warnings } = extractJsonFromText('{"key": "value"}');
    expect(data).toEqual({ key: "value" });
    expect(warnings).toHaveLength(0);
  });

  it("parses JSON in code fence", () => {
    const { data } = extractJsonFromText('```json\n{"key": "value"}\n```');
    expect(data).toEqual({ key: "value" });
  });

  it("extracts JSON from surrounding text", () => {
    const { data, warnings } = extractJsonFromText(
      'Here is the result:\n{"key": "value"}\nDone.'
    );
    expect(data).toEqual({ key: "value" });
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("parses JSON array", () => {
    const { data } = extractJsonFromText('[1, 2, 3]');
    expect(data).toEqual([1, 2, 3]);
  });

  it("throws on invalid JSON", () => {
    expect(() => extractJsonFromText("not json at all")).toThrow();
  });
});

describe("parseFileBlocks", () => {
  it("parses JSON array of file objects", () => {
    const input = JSON.stringify([
      { file_path: "src/index.ts", content_text: "console.log('hi')", file_category: "component" },
      { file_path: "src/app.ts", content_text: "export {}", language: "typescript" },
    ]);
    const { files, warnings } = parseFileBlocks(input);
    expect(files).toHaveLength(2);
    expect(files[0].file_path).toBe("src/index.ts");
    expect(files[1].language).toBe("typescript");
  });

  it("infers language from file extension", () => {
    const input = JSON.stringify([
      { file_path: "schema.sql", content_text: "CREATE TABLE..." },
    ]);
    const { files } = parseFileBlocks(input);
    expect(files[0].language).toBe("sql");
  });

  it("returns empty with warning for non-file text", () => {
    const { files, warnings } = parseFileBlocks("just some text");
    expect(files).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("normalizeResult", () => {
  const makeRaw = (text: string): ProviderRawResult => ({
    provider: "claude",
    model: "test",
    text,
    raw: {},
    durationMs: 100,
  });

  it("normalizes to json", () => {
    const result = normalizeResult(makeRaw('{"a":1}'), "json");
    expect(result.format).toBe("json");
    if (result.format === "json") {
      expect(result.data).toEqual({ a: 1 });
    }
  });

  it("normalizes to text", () => {
    const result = normalizeResult(makeRaw("hello world"), "text");
    expect(result.format).toBe("text");
    if (result.format === "text") {
      expect(result.text).toBe("hello world");
    }
  });

  it("normalizes to files", () => {
    const input = JSON.stringify([
      { file_path: "a.ts", content_text: "code" },
    ]);
    const result = normalizeResult(makeRaw(input), "files");
    expect(result.format).toBe("files");
    if (result.format === "files") {
      expect(result.files).toHaveLength(1);
    }
  });
});

describe("validateNormalizedResult", () => {
  it("returns no errors for valid json", () => {
    const errors = validateNormalizedResult(
      { format: "json", data: { a: 1 }, warnings: [] },
      "json"
    );
    expect(errors).toHaveLength(0);
  });

  it("returns error for empty text", () => {
    const errors = validateNormalizedResult(
      { format: "text", text: "", warnings: [] },
      "text"
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("returns error for empty files", () => {
    const errors = validateNormalizedResult(
      { format: "files", files: [], warnings: [] },
      "files"
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("returns error for format mismatch", () => {
    const errors = validateNormalizedResult(
      { format: "text", text: "hello", warnings: [] },
      "json"
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
