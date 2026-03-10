# Blueprint Preview — Minimal Design

## なぜ blueprint preview が必要か

generate-template は 6 ステップを一括実行する。
途中で blueprint の内容が意図と違うと、後続の implementation / schema / API がすべて無駄になる。
blueprint だけ先に見られれば、早期に方向修正できる。

## generate-template 前に見る価値

- product summary が project の意図と合っているか
- entities が過不足ないか
- roles が正しいか
- screens が想定通りか
- billing / affiliate の有無が合っているか

これらを確認してから full generation に進むことで、やり直しコストを減らせる。

## 今回の scope

- Blueprint セクションの表示を raw JSON → 整形 summary に改善
- Product Summary を青背景のカードで見やすく表示
- Entities / Roles / Screens を一覧表示
- Billing / Affiliate の ON/OFF を明示
- Raw JSON は折りたたみで残す
- Generate Blueprint ボタンは既存のまま維持
- 説明文を追加（full generation 前に確認可能であること）

## データフロー

```
blueprint テーブル
  prd_json / entities_json / screens_json / roles_json / billing_json / affiliate_json
        ↓
  extractBlueprintSummary()
        ↓
  BlueprintSummary { product, entities, roles, screens, billingEnabled, affiliateEnabled }
        ↓
  UI 表示
```

## extractBlueprintSummary の方針

- 各 JSON カラムから主要フィールドを安全に抽出
- フィールド名のバリエーション（name/product_name 等）に対応
- 欠損は空文字列/空配列で返す（crash しない）
- billing/affiliate は `enabled` フィールドの有無で判定

## 将来の拡張候補

- **Approve/Reject**: blueprint を承認してから full generation に進む
- **Edit Blueprint**: UI から blueprint の一部を編集
- **Blueprint Diff**: 再生成時に前回との差分を表示
- **Blueprint Validation**: Zod schema でクライアント側バリデーション

## まだやらないこと

- approval workflow
- blueprint 編集
- diff 表示
- クライアント側 validation
- generate-template フローの変更
