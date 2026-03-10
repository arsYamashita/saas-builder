# Generated Project Summary — Minimal Design

## なぜ generated project summary が必要か

Generated Files セクションはファイル一覧を表示するが、
全体像（ファイル数、種類の内訳、生成・品質チェックの状態）が一目で分からない。
summary カードで俯瞰できるようにする。

## Generated Files 一覧との違い

| | Project Summary | Generated Files |
|---|---|---|
| 目的 | 全体像の把握 | 個別ファイルの確認 |
| 粒度 | 集計（件数・カテゴリ） | ファイル単位（内容含む） |
| 表示位置 | Quality Runs の後 | Summary の後 |

## 今回の scope

- 既存 API データから集計のみ（新規 API なし）
- 表示項目:
  - Generation status + Quality status（バッジ）
  - Blueprint / Implementation Run / Generated File の件数
  - File type 内訳: Pages / API Routes / Components / Tests / Lib/Utils / Other
  - Category breakdown（折りたたみ）
- 生成結果がない場合は非表示

## File type の判定

file_path ベースのパターンマッチ:

| Type | 判定条件 |
|------|---------|
| Pages | `/app/` + `/page.` |
| API Routes | `/api/` or `route.` |
| Components | `/components/` or `.component.` or `.tsx` |
| Tests | `.test.` or `.spec.` or `/tests/` or `/e2e/` |
| Lib/Utils | `/lib/` or `/utils/` |
| Other | 上記に該当しないもの |

## 将来の拡張候補

- **Entity-aware summary**: blueprint の entities と生成ファイルを紐付けて表示
- **Route map**: 生成された画面・API のルート一覧図
- **File diff**: 再生成時の前回との差分
- **Export summary**: export 結果のディレクトリ構造表示

## まだやらないこと

- entity 紐付け
- ルートマップ
- diff 表示
- export 結果の構造表示
