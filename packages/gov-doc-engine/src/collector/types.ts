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
});
export type WatcherSource = z.infer<typeof WatcherSourceSchema>;

export const WatcherConfigSchema = z.object({
  version: z.literal(1),
  sources: z.array(WatcherSourceSchema).min(1),
});
export type WatcherConfig = z.infer<typeof WatcherConfigSchema>;
