# Blueprint Diff — Minimal Design

## なぜ blueprint diff が必要か

blueprint を再生成した時に「前回から何が変わったか」が分からないと、
改善されたか悪化したか判断できない。
名前レベルの軽量 diff で変化を可視化する。

## Generated files diff より先にやる理由

1. blueprint は構造化 JSON で比較しやすい
2. 項目数が少なく（entities / roles / screens）diff が見やすい
3. テンプレ改善サイクルで blueprint 再生成は頻繁に行われる
4. generated files は数十〜数百ファイルで diff が膨大になる

## 今回の scope

- latest と previous（version が1つ前）の2件のみ比較
- `extractBlueprintSummary` を再利用して構造化データに変換
- 比較は名前ベース（deep JSON diff ではない）

## 比較項目

| セクション | 比較方法 |
|-----------|---------|
| Product Summary | name / problem / target / category の文字列比較 |
| Entities | 名前の集合比較 → added / removed |
| Roles | 名前の集合比較 → added / removed |
| Screens | 名前の集合比較 → added / removed |
| Billing | enabled の真偽比較 |
| Affiliate | enabled の真偽比較 |

## 表示ルール

- blueprints が2件未満なら非表示
- 差分がない場合は「前回との差分はありません」
- added は緑バッジ（`+ name`）、removed は赤バッジ（`- name`）
- product field の変更は `from → to` 形式
- billing / affiliate の変更は amber バッジ

## 将来の拡張候補

- **Deep JSON diff**: field 単位の値比較（description の変更検出等）
- **Side-by-side compare**: 2つの blueprint を横並び表示
- **Approve/reject with diff**: diff を見てから承認して次ステップに進む
- **3-way diff**: 任意の2バージョンを選んで比較

## まだやらないこと

- deep JSON diff
- side-by-side compare
- approval workflow
- 任意バージョン選択
- entity の description 変更検出
