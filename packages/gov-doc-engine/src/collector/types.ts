import { z } from "zod";

/**
 * 監視対象1件の設定（省庁・自治体のページ + セレクタ）。
 */
export const WatcherSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  agency: z.string().min(1),
  url: z.string().url(),
  /** 監視対象を絞り込む CSS セレクタ（ページ全体のノイズを除外するため） */
  selector: z.string().min(1),
  category: z.enum(["subsidy", "regulation", "notice"]).default("subsidy"),
  checkIntervalMinutes: z.number().int().positive().max(1440).default(60),
  /**
   * 「このページは移動しました」等、ページ移動/soft-404 を示す文言の許可リスト。
   * 明示した source でだけ soft-404 判定を行う（許可リスト方式）。
   * 判定範囲は <title>・最初の <h1>・selector 領域の先頭ブロックに限る（本文全体は見ない）。
   * 実サイトで確認した文言だけを設定すること（README 参照）。
   */
  movedPhrases: z.array(z.string().min(1)).max(20).optional(),
  /**
   * 期待する HTTP ステータス。設定した場合のみ、実応答のステータスと突き合わせ、
   * 一致しなければ source_moved と同じ扱いにする（例: soft-404 で本文だけ 404）。
   * 未設定なら status 判定はしない。既定の defaultFetch は非 2xx で throw し実ステータスを返す。
   */
  expectStatus: z.number().int().min(100).max(599).optional(),
  /**
   * 生きたページの <title> が必ず含む文字列（許可リスト側の肯定判定）。
   * title にこの文字列が無ければ移動/404 とみなし source_moved 扱いにする。
   */
  expectTitleIncludes: z.string().min(1).optional(),
});
export type WatcherSource = z.infer<typeof WatcherSourceSchema>;

export const WatcherConfigSchema = z.object({
  version: z.literal(1),
  sources: z.array(WatcherSourceSchema).min(1),
});
export type WatcherConfig = z.infer<typeof WatcherConfigSchema>;
