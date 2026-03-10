# Draft Preview — Minimal Design

## なぜ diff preview が必要か

「下書きを作る」ボタンを押す前に、何が変わるか分からないと不安になる。
field-level の軽量プレビューで「どの項目が埋まるか」を事前に表示する。

## 今回の scope

- field-level の preview のみ（before/after の値は表示しない）
- `buildProjectDraft()` を呼んで `DraftPatch.filledFields` を取得
- `previewDraft()` で label 付きの表示用データに変換
- intake 回答や form 入力が変わるたびに useMemo で再計算
- ボタン押下前に amber 背景のボックスで表示
- 適用後はプレビューを非表示にし、「N件自動入力しました」を表示

## データフロー

```
intake + form + recommendations
        ↓
  buildProjectDraft()  →  DraftPatch { filledFields, suggestedTemplate }
        ↓
  previewDraft()       →  DraftPreview { fields[{key,label}], suggestedTemplateLabel, hasChanges }
        ↓
  UI: amber box に field 一覧 + suggested template を表示
```

## templateKey の表示

- suggestedTemplate がある場合、catalog label を取得して表示
- `getCatalogEntry(key)?.label` で解決
- catalog にない key はそのまま表示

## 将来の拡張候補

- **Before/after preview**: 各 field の現在値と新しい値を並べて表示
- **Per-field apply**: field ごとに適用/スキップを選択
- **AI-generated explanation**: なぜその値を提案したか説明
- **Undo**: 適用前の状態に戻す

## まだやらないこと

- before/after の値表示
- per-field apply
- AI による説明生成
- undo 機能
