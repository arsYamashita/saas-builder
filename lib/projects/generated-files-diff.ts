/**
 * Compares generated file sets between the latest and previous version.
 * Supports both path-level and content-level diff.
 */

export interface ContentDiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
  lineNumber?: number;
}

export interface FileContentDiff {
  file_path: string;
  status: "added" | "removed" | "modified" | "unchanged";
  diffLines: ContentDiffLine[];
  addedLineCount: number;
  removedLineCount: number;
}

export interface GeneratedFilesDiff {
  hasDiffSource: boolean;
  latestVersion: number;
  previousVersion: number;
  addedFiles: string[];
  removedFiles: string[];
  unchangedFiles: string[];
  modifiedFiles: string[];
  contentDiffs: FileContentDiff[];
  totalLatest: number;
  totalPrevious: number;
  hasAnyChange: boolean;
}

interface FileEntry {
  file_path: string;
  version: number;
  content_text?: string;
}

/**
 * Groups files by version, takes the two highest versions,
 * and compares their file_path sets plus content when available.
 * Returns null if fewer than 2 versions exist.
 */
export function computeGeneratedFilesDiff(
  files: FileEntry[]
): GeneratedFilesDiff | null {
  // Collect all distinct versions
  const versionSet = new Set<number>();
  for (const f of files) {
    versionSet.add(f.version);
  }

  const versions = Array.from(versionSet).sort((a, b) => b - a);
  if (versions.length < 2) return null;

  const latestVersion = versions[0];
  const previousVersion = versions[1];

  const latestFiles = files.filter((f) => f.version === latestVersion);
  const previousFiles = files.filter((f) => f.version === previousVersion);

  const latestMap = new Map(latestFiles.map((f) => [f.file_path, f]));
  const previousMap = new Map(previousFiles.map((f) => [f.file_path, f]));

  const latestPaths = new Set(latestFiles.map((f) => f.file_path));
  const previousPaths = new Set(previousFiles.map((f) => f.file_path));

  const addedFiles = Array.from(latestPaths).filter((p) => !previousPaths.has(p)).sort();
  const removedFiles = Array.from(previousPaths).filter((p) => !latestPaths.has(p)).sort();

  // Files present in both versions — check content
  const commonPaths = Array.from(latestPaths).filter((p) => previousPaths.has(p)).sort();
  const modifiedFiles: string[] = [];
  const unchangedFiles: string[] = [];
  const contentDiffs: FileContentDiff[] = [];

  for (const path of commonPaths) {
    const latest = latestMap.get(path)!;
    const previous = previousMap.get(path)!;

    if (latest.content_text != null && previous.content_text != null &&
        latest.content_text !== previous.content_text) {
      modifiedFiles.push(path);
      contentDiffs.push(computeContentDiff(path, previous.content_text, latest.content_text));
    } else if (latest.content_text == null || previous.content_text == null) {
      // No content available — treat as unchanged at path level
      unchangedFiles.push(path);
    } else {
      unchangedFiles.push(path);
    }
  }

  // Also add added/removed files as content diffs for full picture
  for (const path of addedFiles) {
    const f = latestMap.get(path);
    if (f?.content_text) {
      const lines = f.content_text.split("\n");
      contentDiffs.push({
        file_path: path,
        status: "added",
        diffLines: lines.map((text, i) => ({ type: "added", text, lineNumber: i + 1 })),
        addedLineCount: lines.length,
        removedLineCount: 0,
      });
    }
  }

  for (const path of removedFiles) {
    const f = previousMap.get(path);
    if (f?.content_text) {
      const lines = f.content_text.split("\n");
      contentDiffs.push({
        file_path: path,
        status: "removed",
        diffLines: lines.map((text, i) => ({ type: "removed", text, lineNumber: i + 1 })),
        addedLineCount: 0,
        removedLineCount: lines.length,
      });
    }
  }

  return {
    hasDiffSource: true,
    latestVersion,
    previousVersion,
    addedFiles,
    removedFiles,
    unchangedFiles,
    modifiedFiles,
    contentDiffs,
    totalLatest: latestPaths.size,
    totalPrevious: previousPaths.size,
    hasAnyChange: addedFiles.length > 0 || removedFiles.length > 0 || modifiedFiles.length > 0,
  };
}

/**
 * Simple line-by-line diff using longest common subsequence.
 * Keeps it lightweight — no external dependency.
 */
function computeContentDiff(
  filePath: string,
  oldText: string,
  newText: string
): FileContentDiff {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const diffLines = simpleDiff(oldLines, newLines);

  return {
    file_path: filePath,
    status: "modified",
    diffLines,
    addedLineCount: diffLines.filter((l) => l.type === "added").length,
    removedLineCount: diffLines.filter((l) => l.type === "removed").length,
  };
}

/**
 * Minimal LCS-based line diff.
 * For large files, limits context to avoid huge output.
 */
function simpleDiff(oldLines: string[], newLines: string[]): ContentDiffLine[] {
  // For very large files, fall back to a summary
  if (oldLines.length > 500 || newLines.length > 500) {
    return summarizeLargeDiff(oldLines, newLines);
  }

  const lcs = computeLCS(oldLines, newLines);
  const result: ContentDiffLine[] = [];
  let oi = 0;
  let ni = 0;

  for (const common of lcs) {
    // Lines removed from old before this common line
    while (oi < oldLines.length && oldLines[oi] !== common) {
      result.push({ type: "removed", text: oldLines[oi], lineNumber: oi + 1 });
      oi++;
    }
    // Lines added in new before this common line
    while (ni < newLines.length && newLines[ni] !== common) {
      result.push({ type: "added", text: newLines[ni], lineNumber: ni + 1 });
      ni++;
    }
    // Skip the common line in output (context not shown to keep diff compact)
    oi++;
    ni++;
  }

  // Remaining lines
  while (oi < oldLines.length) {
    result.push({ type: "removed", text: oldLines[oi], lineNumber: oi + 1 });
    oi++;
  }
  while (ni < newLines.length) {
    result.push({ type: "added", text: newLines[ni], lineNumber: ni + 1 });
    ni++;
  }

  return result;
}

/**
 * Compute LCS of two string arrays.
 * Uses O(n*m) DP — acceptable for files up to ~500 lines.
 */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/**
 * For large files, just show a summary of added/removed line counts.
 */
function summarizeLargeDiff(oldLines: string[], newLines: string[]): ContentDiffLine[] {
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const removed = oldLines.filter((l) => !newSet.has(l));
  const added = newLines.filter((l) => !oldSet.has(l));

  const result: ContentDiffLine[] = [];

  // Show first 20 removed and first 20 added
  for (const line of removed.slice(0, 20)) {
    result.push({ type: "removed", text: line });
  }
  if (removed.length > 20) {
    result.push({ type: "removed", text: `... and ${removed.length - 20} more removed lines` });
  }

  for (const line of added.slice(0, 20)) {
    result.push({ type: "added", text: line });
  }
  if (added.length > 20) {
    result.push({ type: "added", text: `... and ${added.length - 20} more added lines` });
  }

  return result;
}
