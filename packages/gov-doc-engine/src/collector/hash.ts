import { createHash } from "node:crypto";

/** 正規化済みコンテンツの SHA-256 ハッシュ（差分検知のキー）。 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
