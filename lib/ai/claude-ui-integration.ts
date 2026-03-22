/**
 * Claude UI Integration
 *
 * Takes Lovable-generated UI scaffold and merges it with Claude-generated
 * implementation (schema, API routes, permissions) to produce a coherent
 * full-stack output.
 *
 * Flow:
 *   1. Receive split-file output (implementation files) and UI scaffold
 *   2. Identify conflicts (duplicate files, mismatched imports)
 *   3. Generate merge instructions via Claude
 *   4. Return merged file set
 */

import type { ProviderRawResult, GenerationRequest } from "@/lib/providers/provider-interface";
import type { NormalizedFileEntry } from "@/lib/providers/result-normalizer";

// ── Types ───────────────────────────────────────────────────

export interface UiIntegrationInput {
  /** Files from Claude implementation pipeline (schema, API, lib) */
  implementationFiles: NormalizedFileEntry[];
  /** Files from Lovable UI scaffold */
  uiScaffoldFiles: NormalizedFileEntry[];
  /** Blueprint JSON for context */
  blueprintJson: string;
  /** Template key for rule resolution */
  templateKey: string;
}

export interface UiIntegrationResult {
  /** Final merged file set */
  mergedFiles: NormalizedFileEntry[];
  /** Files that were added from UI scaffold without conflict */
  addedFromUi: string[];
  /** Files that had conflicts and were resolved by Claude */
  mergedConflicts: string[];
  /** Warnings about potential issues */
  warnings: string[];
}

export type UiIntegrationAdapter = {
  generate(request: GenerationRequest): Promise<ProviderRawResult>;
};

// ── Helpers ─────────────────────────────────────────────────

/**
 * Detects file path conflicts between implementation and UI scaffold.
 */
export function detectConflicts(
  implFiles: NormalizedFileEntry[],
  uiFiles: NormalizedFileEntry[]
): { conflicting: string[]; uiOnly: string[]; implOnly: string[] } {
  const implPaths = new Set(implFiles.map((f) => f.file_path));
  const uiPaths = new Set(uiFiles.map((f) => f.file_path));

  const conflicting: string[] = [];
  const uiOnly: string[] = [];
  const implOnly: string[] = [];

  Array.from(uiPaths).forEach((p) => {
    if (implPaths.has(p)) {
      conflicting.push(p);
    } else {
      uiOnly.push(p);
    }
  });

  Array.from(implPaths).forEach((p) => {
    if (!uiPaths.has(p)) {
      implOnly.push(p);
    }
  });

  return { conflicting, uiOnly, implOnly };
}

/**
 * Builds a merge prompt for conflicting files.
 */
export function buildMergePrompt(
  filePath: string,
  implContent: string,
  uiContent: string,
  blueprintJson: string
): string {
  return `You are merging two versions of the same file in a SaaS project.

## File: ${filePath}

### Implementation version (Claude — backend logic, types, API):
\`\`\`
${implContent}
\`\`\`

### UI scaffold version (Lovable — React components, styling):
\`\`\`
${uiContent}
\`\`\`

### Blueprint context:
${blueprintJson.slice(0, 2000)}

## Instructions:
1. Preserve ALL backend logic, types, API calls, and auth guards from the implementation version.
2. Adopt the UI layout, styling, and component structure from the UI scaffold version.
3. Fix any import mismatches — prefer @/ path aliases.
4. Ensure the merged file compiles with TypeScript strict mode.
5. Return ONLY the merged file content, no explanation.`;
}

/**
 * Integrates UI scaffold with implementation files.
 *
 * Non-conflicting UI files are added directly.
 * Conflicting files are merged via Claude.
 */
export async function integrateUiWithImplementation(
  input: UiIntegrationInput,
  adapter: UiIntegrationAdapter
): Promise<UiIntegrationResult> {
  const { implementationFiles, uiScaffoldFiles, blueprintJson } = input;
  const { conflicting, uiOnly } = detectConflicts(implementationFiles, uiScaffoldFiles);

  const implByPath = new Map(implementationFiles.map((f) => [f.file_path, f]));
  const uiByPath = new Map(uiScaffoldFiles.map((f) => [f.file_path, f]));

  const mergedFiles: NormalizedFileEntry[] = [...implementationFiles];
  const addedFromUi: string[] = [];
  const mergedConflicts: string[] = [];
  const warnings: string[] = [];

  // Add non-conflicting UI files directly
  for (const path of uiOnly) {
    const uiFile = uiByPath.get(path);
    if (uiFile) {
      mergedFiles.push(uiFile);
      addedFromUi.push(path);
    }
  }

  // Merge conflicting files via Claude
  for (const path of conflicting) {
    const implFile = implByPath.get(path)!;
    const uiFile = uiByPath.get(path)!;

    try {
      const prompt = buildMergePrompt(
        path,
        implFile.content_text,
        uiFile.content_text,
        blueprintJson
      );

      const result = await adapter.generate({
        prompt,
        system: "You are a senior full-stack engineer. Merge files precisely.",
        taskKind: "ui_generation",
        maxTokens: 16384,
      });

      // Replace implementation file with merged version
      const idx = mergedFiles.findIndex((f) => f.file_path === path);
      if (idx >= 0) {
        mergedFiles[idx] = { file_path: path, content_text: result.text.trim(), file_category: "page", language: "typescript" };
      }
      mergedConflicts.push(path);
    } catch (err) {
      // On merge failure, keep implementation version
      warnings.push(
        `Failed to merge ${path}: ${err instanceof Error ? err.message : "unknown error"}. Keeping implementation version.`
      );
    }
  }

  return { mergedFiles, addedFromUi, mergedConflicts, warnings };
}
