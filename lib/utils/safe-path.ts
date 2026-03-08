import path from "node:path";

export function isSafeRelativePath(filePath: string): boolean {
  if (!filePath || path.isAbsolute(filePath)) return false;
  if (filePath.includes("..")) return false;
  if (filePath.includes("\0")) return false;
  return true;
}

export function normalizeExportPath(projectId: string, filePath: string): string {
  return path.join(process.cwd(), "exports", "projects", projectId, filePath);
}
