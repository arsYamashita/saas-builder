# Quality Gate Progress UI — Minimal Design

## なぜ quality gate progress が必要か

Quality gate は npm install → lint → typecheck → playwright を順番実行し、
数分かかる。実行中にどのチェックが通って、どこで止まっているか見えないと
ユーザーは結果を待つしかない。

## generation progress との違い

| | Generation Progress | Quality Progress |
|---|---|---|
| 対象 | generation_runs | quality_runs |
| ステップ | 6 (blueprint〜export) | 4 (install〜playwright) |
| status 値 | completed / failed | passed / failed |
| 色テーマ | blue | orange |
| エラー表示 | error_message のみ | stderr の先頭500文字をインライン表示 |

## 今回の実装

- `handleGenerate("run-quality-gate", ...)` 時に `startPolling("quality")` を開始
- 3秒間隔で `fetchProject()` を再取得
- latest quality run の status が `passed` / `failed` になったら停止
- polling は generation と quality で排他（同時に1つだけ）

## toQualityProgress helper

- quality run → `QualityProgress` に変換
- 各チェック: key / label / status / exitCode / durationMs / errorPreview
- `errorPreview`: failed/error 時の stderr 先頭500文字
- `passedCount` / `totalCount` でプログレスバーを計算

## 表示項目

- Overall status バッジ (running / passed / failed)
- プログレスバー (passedCount / totalCount)
- 各チェック:
  - 色付きドット (green=passed, orange+pulse=running, red=failed/error, gray=pending)
  - label + status + duration
  - failed 時は stderr プレビューをインライン表示
- summary (あれば)

## 将来の拡張候補

- **Streaming logs**: チェック実行中の stdout/stderr をリアルタイム表示
- **Foldable check output**: 各チェックの全出力を折りたたみで表示
- **Generation + Quality unified timeline**: 生成と品質チェックを1つのタイムラインで表示
- **Re-run single check**: 失敗したチェックだけ再実行

## まだやらないこと

- ログのストリーミング
- 全出力の折りたたみ表示
- 統合タイムライン
- 個別チェックの再実行
- SSE / WebSocket
