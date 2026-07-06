import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { WatcherConfigSchema, type WatcherConfig } from "./types";

/** YAML テキストから監視設定を読み込み、Zod で検証する。 */
export function loadWatcherConfigFromYaml(yamlText: string): WatcherConfig {
  const raw = load(yamlText);
  return WatcherConfigSchema.parse(raw);
}

/** ファイルパスから監視設定を読み込む（実ファイル I/O — テストでは loadWatcherConfigFromYaml を使う）。 */
export function loadWatcherConfigFromFile(path: string): WatcherConfig {
  return loadWatcherConfigFromYaml(readFileSync(path, "utf8"));
}
