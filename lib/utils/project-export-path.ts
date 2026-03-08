import path from "node:path";

/**
 * エクスポート済みプロジェクトのルートディレクトリを返す
 */
export function getProjectExportPath(projectId: string): string {
  return path.join(process.cwd(), "exports", "projects", projectId);
}
