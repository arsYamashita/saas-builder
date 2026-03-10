# Project Draft Builder — Minimal Design

## なぜ 1クリック下書きが必要か

intake questions に答えた後、ユーザーはまだ form 項目を個別に確認して埋める必要がある。
「下書きを作る」ボタンで intake 回答 + recommendation を使い、空欄を一括で埋める。

## intake / recommendation / preset の関係

```
intake answers → intakeToFormHints() → draft hints
                                          ↓
recommendations → 1位の templateKey → draft patch
                                          ↓
                               buildProjectDraft()
                                          ↓
                            form state 更新（空欄のみ）
```

- **intake**: ユーザーの回答から form hints を生成
- **recommendation**: form state から最適テンプレを scoring
- **preset**: テンプレ選択時に適用される初期値セット
- **draft builder**: intake hints + recommendation 1位を組み合わせて空欄を埋める

## Rule-based であること

今回は AI 呼び出しなし。intakeToFormHints() の出力をそのまま使い、
空欄かどうかの判定だけを行う。

## Form が Source of Truth

- draft は空欄のみを埋める。ユーザーが入力済みの値は上書きしない
- draft 適用後も手動編集で自由に変更可能
- submit 時は form state のみを送信（draft の痕跡は送らない）

## templateKey の扱い

- recommendation 1位を suggestedTemplate として返す
- form の templateKey がデフォルト値の場合のみ自動適用
- ユーザーが既にテンプレを変更済みなら上書きしない
- 適用時は handleTemplateChange() 経由で preset も読み込む

## 将来の拡張候補

- **AI-generated first draft**: summary から AI で詳細項目を推測
- **Diff preview**: 適用前にどの項目が変わるか表示
- **Partial apply**: 項目ごとに適用/スキップを選択
- **Undo**: draft 適用前の状態に戻す

## まだやらないこと

- AI 呼び出し
- diff preview / partial apply
- undo 機能
- name（サービス名）の自動生成
- draft の永続化
