/**
 * Compares generated file sets between the latest and previous version.
 * Comparison is path-level only — no content diff.
 */

export interface GeneratedFilesDiff {
  hasDiffSource: boolean;
  latestVersion: number;
  previousVersion: number;
  addedFiles: string[];
  removedFiles: string[];
  unchangedFiles: string[];
  totalLatest: number;
  totalPrevious: number;
  hasAnyChange: boolean;
}

interface FileEntry {
  file_path: string;
  version: number;
}

/**
 * Groups files by version, takes the two highest versions,
 * and compares their file_path sets.
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

  const latestPaths = new Set(
    files.filter((f) => f.version === latestVersion).map((f) => f.file_path)
  );
  const previousPaths = new Set(
    files.filter((f) => f.version === previousVersion).map((f) => f.file_path)
  );

  const addedFiles = Array.from(latestPaths).filter((p) => !previousPaths.has(p)).sort();
  const removedFiles = Array.from(previousPaths).filter((p) => !latestPaths.has(p)).sort();
  const unchangedFiles = Array.from(latestPaths).filter((p) => previousPaths.has(p)).sort();

  return {
    hasDiffSource: true,
    latestVersion,
    previousVersion,
    addedFiles,
    removedFiles,
    unchangedFiles,
    totalLatest: latestPaths.size,
    totalPrevious: previousPaths.size,
    hasAnyChange: addedFiles.length > 0 || removedFiles.length > 0,
  };
}
