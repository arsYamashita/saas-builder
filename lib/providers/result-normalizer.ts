/**
 * Result Normalizer
 *
 * Converts raw provider output into structured formats based on expectedFormat.
 * Handles: JSON extraction, code fence stripping, file block parsing.
 */

import type {
  TaskKind,
  ExpectedFormat,
  ProviderRawResult,
  TASK_EXPECTED_FORMAT,
} from "./provider-interface";

// ── Normalized Result Types ─────────────────────────────────

export interface NormalizedJsonResult {
  format: "json";
  data: unknown;
  warnings: string[];
}

export interface NormalizedTextResult {
  format: "text";
  text: string;
  warnings: string[];
}

export interface NormalizedFileEntry {
  file_path: string;
  file_category: string;
  language: string;
  title?: string;
  description?: string;
  content_text: string;
}

export interface NormalizedFilesResult {
  format: "files";
  files: NormalizedFileEntry[];
  warnings: string[];
}

export type NormalizedResult =
  | NormalizedJsonResult
  | NormalizedTextResult
  | NormalizedFilesResult;

// ── Code Fence Stripper ─────────────────────────────────────

export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  // Match opening ``` with optional language tag and closing ```
  const match = trimmed.match(/^```[\w]*\s*\n?([\s\S]*?)\n?\s*```$/);
  if (match) return match[1].trim();
  // Try simpler pattern: just leading and trailing ```
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed
      .replace(/^```[\w]*\s*\n?/, "")
      .replace(/\n?\s*```$/, "")
      .trim();
  }
  return trimmed;
}

// ── JSON Extractor ──────────────────────────────────────────

export function extractJsonFromText(text: string): { data: unknown; warnings: string[] } {
  const warnings: string[] = [];
  const stripped = stripCodeFences(text);

  // Try direct parse first
  try {
    return { data: JSON.parse(stripped), warnings };
  } catch {
    // continue to fallback strategies
  }

  // Try to find JSON object or array in the text
  const jsonMatch = stripped.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      warnings.push("JSON extracted from surrounding text");
      return { data, warnings };
    } catch {
      // continue
    }
  }

  // Try to find multiple code blocks and parse the first valid JSON
  const codeBlocks = text.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/g);
  if (codeBlocks) {
    for (const block of codeBlocks) {
      const inner = block
        .replace(/^```(?:json)?\s*\n/, "")
        .replace(/\n\s*```$/, "")
        .trim();
      try {
        const data = JSON.parse(inner);
        warnings.push("JSON extracted from code block");
        return { data, warnings };
      } catch {
        continue;
      }
    }
  }

  throw new Error(`Failed to extract JSON from provider output (${text.length} chars)`);
}

// ── File Block Parser ───────────────────────────────────────

export function parseFileBlocks(text: string): { files: NormalizedFileEntry[]; warnings: string[] } {
  const warnings: string[] = [];

  // Strategy 1: Try as JSON array of file objects
  try {
    const { data } = extractJsonFromText(text);
    if (Array.isArray(data)) {
      const files = data
        .filter(
          (item: unknown): item is Record<string, unknown> =>
            typeof item === "object" && item !== null && "file_path" in item && "content_text" in item
        )
        .map((item) => ({
          file_path: String(item.file_path),
          file_category: String(item.file_category ?? "other"),
          language: String(item.language ?? inferLanguage(String(item.file_path))),
          title: item.title ? String(item.title) : undefined,
          description: item.description ? String(item.description) : undefined,
          content_text: String(item.content_text),
        }));

      if (files.length > 0) {
        return { files, warnings };
      }
    }
  } catch {
    // Not a JSON array — try other strategies
  }

  // Strategy 2: Parse file blocks from markdown-style output
  // Pattern: --- file_path: path/to/file ---\n```\ncontent\n```
  const blockPattern = /---\s*file_path:\s*(.+?)\s*---\s*\n```[\w]*\n([\s\S]*?)\n```/g;
  const files: NormalizedFileEntry[] = [];
  let match;
  while ((match = blockPattern.exec(text)) !== null) {
    files.push({
      file_path: match[1].trim(),
      file_category: "other",
      language: inferLanguage(match[1].trim()),
      content_text: match[2],
    });
  }

  if (files.length > 0) {
    warnings.push("Files parsed from markdown block format");
    return { files, warnings };
  }

  warnings.push("No file blocks found in output");
  return { files: [], warnings };
}

function inferLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    sql: "sql",
    md: "markdown",
    json: "json",
    css: "css",
    html: "html",
    yaml: "yaml",
    yml: "yaml",
  };
  return map[ext ?? ""] ?? "text";
}

// ── Main Normalizer ─────────────────────────────────────────

export function normalizeResult(
  rawResult: ProviderRawResult,
  expectedFormat: ExpectedFormat
): NormalizedResult {
  switch (expectedFormat) {
    case "json": {
      const { data, warnings } = extractJsonFromText(rawResult.text);
      return { format: "json", data, warnings };
    }
    case "text": {
      return {
        format: "text",
        text: rawResult.text,
        warnings: [],
      };
    }
    case "files": {
      const { files, warnings } = parseFileBlocks(rawResult.text);
      return { format: "files", files, warnings };
    }
  }
}

// ── Validation ──────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

export function validateNormalizedResult(
  result: NormalizedResult,
  expectedFormat: ExpectedFormat
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (result.format !== expectedFormat) {
    errors.push({
      field: "format",
      message: `Expected ${expectedFormat} but got ${result.format}`,
    });
    return errors;
  }

  switch (result.format) {
    case "json":
      if (result.data === null || result.data === undefined) {
        errors.push({ field: "data", message: "JSON data is null or undefined" });
      }
      break;
    case "text":
      if (!result.text || result.text.trim().length === 0) {
        errors.push({ field: "text", message: "Text output is empty" });
      }
      break;
    case "files":
      if (result.files.length === 0) {
        errors.push({ field: "files", message: "No files in output" });
      }
      for (let i = 0; i < result.files.length; i++) {
        const f = result.files[i];
        if (!f.file_path) {
          errors.push({ field: `files[${i}].file_path`, message: "Missing file_path" });
        }
        if (!f.content_text) {
          errors.push({ field: `files[${i}].content_text`, message: "Missing content_text" });
        }
      }
      break;
  }

  return errors;
}
