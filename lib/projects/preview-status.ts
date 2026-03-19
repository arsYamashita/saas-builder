/**
 * Preview Status Management
 *
 * Manages project status transitions for the preview lifecycle:
 *   generated → preview → deployed
 */

import type { ProjectStatus } from "@/types/project";

/** Valid transitions FROM a status */
const VALID_TRANSITIONS: Record<string, ProjectStatus[]> = {
  draft: ["blueprint_ready", "error"],
  blueprint_ready: ["generating", "error"],
  generating: ["generated", "error"],
  generated: ["preview", "generating", "error"],
  preview: ["deployed", "generating", "error"],
  deployed: ["generating", "error"],
  error: ["draft", "generating"],
};

/**
 * Check if a status transition is valid
 */
export function canTransition(
  from: ProjectStatus,
  to: ProjectStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Determine if a project can enter preview mode
 */
export function canPreview(status: ProjectStatus): boolean {
  return status === "generated" || status === "preview" || status === "deployed";
}

/**
 * Get the preview availability message
 */
export function getPreviewMessage(status: ProjectStatus): string {
  switch (status) {
    case "draft":
      return "Blueprint を生成するとワイヤーフレームプレビューが利用可能になります";
    case "blueprint_ready":
      return "Blueprint からワイヤーフレームプレビューが表示されます";
    case "generating":
      return "生成中... 完了後にプレビューが更新されます";
    case "generated":
      return "生成完了。Live Preview で確認できます";
    case "preview":
      return "プレビュー中";
    case "deployed":
      return "デプロイ済み";
    case "error":
      return "エラーが発生しました。再生成してください";
    default:
      return "";
  }
}
