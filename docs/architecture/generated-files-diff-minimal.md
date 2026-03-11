# Generated Files Diff — Minimal Design

## なぜ generated files diff が必要か

Full Generate を再実行した時に「前回と何が変わったか」をファイル名レベルで即座に把握するため。
Blueprint diff がエンティティ名の変化を示すのに対し、files diff は実際の出力ファイルの増減を示す。

## 今回の scope

- latest と previous（version が1つ前）の2件のみ比較
- 比較は `file_path` の集合レベルのみ（内容 diff ではない）
- 2バージョン未満の場合は非表示

## helper: `computeGeneratedFilesDiff`

`lib/projects/generated-files-diff.ts`

入力: `{ file_path: string; version: number }[]`
出力: `GeneratedFilesDiff | null`

処理:
1. version の集合を取得、降順ソート
2. 上位2バージョンを latest / previous として選出
3. 各バージョンの file_path 集合を比較
4. added / removed / unchanged を算出

## UI 表示

- indigo 背景のセクション、Generated Project Summary と Generated Files の間に配置
- バージョン番号を `v{prev} → v{latest}` で表示
- 差分なし: 「前回との差分はありません」
- added: 緑バッジ `+ path`
- removed: 赤バッジ `- path`
- unchanged: 折りたたみ（details/summary）でグレーバッジ

## 将来の拡張候補

- **Content diff**: ファイル内容レベルの差分表示
- **Side-by-side compare**: 同一パスのファイルを横並び比較
- **任意バージョン選択**: 2つのバージョンを自由に選んで比較
- **Diff summary**: added/removed の理由推定（blueprint 変更との紐付け）

## まだやらないこと

- content diff（内容レベルの比較）
- side-by-side compare
- 任意バージョン選択
- blueprint diff との連動
