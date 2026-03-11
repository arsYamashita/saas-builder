# Blueprint Approval — Minimal Design

## なぜ approval が必要か

Blueprint を生成・再生成した後、Full Generate に進む前に「この blueprint で良い」と確認するステップが欲しい。
今回は本格的な承認ワークフローではなく、最小限の「確認済みマーク」だけを実装する。

## 今回の scope

- blueprints テーブルに `review_status` / `reviewed_at` を追加
- `review_status` のデフォルトは `pending`
- approve API で `approved` に更新
- UI は Blueprint Preview 内にボタン / バッジを表示
- generate-template のブロック条件にはまだしない

## DB 変更

`supabase/migrations/0008_blueprint_review_status.sql`

```sql
alter table blueprints
  add column if not exists review_status text not null default 'pending',
  add column if not exists reviewed_at timestamptz;
```

## API

`POST /api/projects/[projectId]/approve-blueprint`

- body: `{ blueprintId?: string }` — 省略時は latest blueprint を approve
- 成功: `{ ok: true, blueprintId }`
- 失敗: 404（blueprint なし）or 500

## UI 表示

Blueprint Preview セクション内、Raw JSON の下に配置:

- 未承認: 「Blueprint を確認済みにする」緑ボタン
- 承認済み: 「確認済み」緑バッジ + reviewed_at 日時

## generate-template との関係

現時点では approval 状態に関わらず Full Generate を実行できる。
将来的に「approved でないと generate-template を実行できない」制約を入れる想定。

## 将来の拡張候補

- **Reject**: 不承認 → 再生成を促す
- **Comment**: 承認/不承認の理由メモ
- **Approval required before full generate**: generate-template の前提条件にする
- **Role-based approval**: 特定ロールのみ承認可能
- **Approval history**: 承認履歴の保持

## まだやらないこと

- reject / comment
- generate-template のブロック条件
- ロールベースの承認制御
- 承認履歴の保持
- approved 以外のステータス（rejected / needs_revision 等）
