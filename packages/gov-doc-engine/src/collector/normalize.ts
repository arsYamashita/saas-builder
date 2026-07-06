/**
 * HTML を正規化してハッシュ比較のノイズ（コメント・空白の揺れ・script/style 差分等）を除去する。
 * 実際のコンテンツが変わっていないのに広告タグ・トラッキングスクリプトの差し替えだけで
 * 「変更あり」と誤判定しないようにするための前処理。
 */
export function normalizeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}
