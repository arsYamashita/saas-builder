# Project Brief Rewrite — Minimal Design

## なぜ brief rewrite が必要か

ユーザーが入力する summary / problemToSolve / targetUsers は
曖昧だったり冗長だったりすることが多い。
AI で短く具体的に整えることで、後段の blueprint 生成の精度も上がる。

## generate-template 本体にまだ入れない理由

1. rewrite は「入力補助」であり、生成パイプラインの一部ではない
2. 本体に組み込むと失敗時の影響範囲が大きい
3. まずは独立した補助機能として検証する
4. 将来的に本体に統合するかは利用状況を見て判断

## 今回の scope

- 対象: summary, problemToSolve, targetUsers の3項目のみ
- API: `POST /api/projects/rewrite-brief`
- AI: Gemini (Claude fallback) で日本語整形
- Prompt: `prompts/utility/rewrite-project-brief.md`
- UI: 詳細設定の「基本情報」セクションに「AIで整える」ボタン
- 空欄は整形しない（そのまま返す）
- 意味を変えない、誇張しない

## データフロー

```
[AIで整える] ボタン押下
      ↓
POST /api/projects/rewrite-brief
  { summary, problemToSolve, targetUsers }
      ↓
readPrompt("utility/rewrite-project-brief.md")
      ↓
generateWithGemini({ prompt })
      ↓
JSON parse → { rewrittenSummary, rewrittenProblemToSolve, rewrittenTargetUsers }
      ↓
form state 更新
```

## 将来の拡張候補

- **Template-aware rewrite**: templateKey に応じて整形の方向性を変える
- **Multilingual rewrite**: 英語入力を日本語に整形、またはその逆
- **Rewrite diff preview**: 整形前後の差分を表示してから適用
- **パイプライン統合**: blueprint 生成前に自動で rewrite を挟む

## まだやらないこと

- template-aware な整形
- 多言語対応
- diff preview（整形前後の比較表示）
- generate-template 本体への統合
- rewrite 履歴の保存
