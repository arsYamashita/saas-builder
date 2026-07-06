import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "..", "fixtures");

/** テスト用フィクスチャ HTML を読み込む（packages/gov-doc-engine/fixtures/ 配下）。 */
export function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}
