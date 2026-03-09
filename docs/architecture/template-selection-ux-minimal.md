# Template Selection UX — Minimal Design

## なぜこの改善が必要か

3テンプレ体制になり、ユーザーが「どのテンプレを選ぶべきか」を判断できる情報が不足していた。
select の option label だけでは、各テンプレの違い（対象ユーザー、含まれるエンティティ、課金有無）が分からない。

## Template Catalog の役割

`lib/templates/template-catalog.ts` は UI 表示用のメタデータを集約する。

Template Registry（prompt routing 用）とは別のレイヤー:
- **Registry**: prompt path, rules path, fixture path など技術メタデータ
- **Catalog**: label, description, targetUsers, statusBadge など UI メタデータ

両方とも templateKey で紐づく。

## 今回入れた表示項目

| 項目 | 説明 |
|------|------|
| label | テンプレ名 |
| shortDescription | 1行の概要 |
| targetUsers | 想定ユーザー |
| coreEntities | 主要エンティティ（3〜5個） |
| includesBilling | 課金機能の有無 |
| includesAffiliate | アフィリエイト機能の有無 |
| statusBadge | GREEN / DRAFT |
| recommendedFor | 推奨用途（1行） |

## new/page.tsx の改善点

- template option を `TEMPLATE_CATALOG` 配列から動的生成（3テンプレ分）
- preset 適用を `PRESET_MAP` で一元化（if/else チェーン削除）
- テンプレ選択時に summary card を表示
- online_salon / custom は catalog 未登録のためハードコード option として残置

## 将来の拡張候補

- テンプレ検索 / フィルタリング
- おすすめテンプレの自動提案（入力内容ベース）
- テンプレ比較表
- テンプレごとのスクリーンショットプレビュー
- catalog を registry と統合（manifest に UI メタデータを追加）

## まだやらないこと

- online_salon / custom の catalog 登録
- テンプレごとのプレビュー画面
- registry と catalog の統合
- 動的テンプレロード
