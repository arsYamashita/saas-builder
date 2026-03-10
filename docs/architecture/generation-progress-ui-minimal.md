# Generation Progress UI — Minimal Design

## なぜ progress UI が必要か

generate-template は 6 ステップを順番実行し、数分かかる。
実行中に何が起きているか見えないと、ユーザーはフリーズしたと思う。
ステップごとの進捗を見せることで安心感を与える。

## 今回の実装: polling ベース

- Generate Full Template ボタン押下時に 3秒間隔の polling を開始
- 既存の `GET /api/projects/{id}` を再取得して `generationRuns` を更新
- latest run の `status` が `completed` または `failed` になったら polling 停止
- `handleGenerate` の完了時にも polling を停止（二重停止は安全）

## 履歴表示との違い

| | Progress UI | Generation Runs (履歴) |
|---|---|---|
| 対象 | 最新の active run のみ | 全 run |
| 表示条件 | running 中 or polling 中 | 常時 |
| UI | プログレスバー + ステップ一覧 | 簡素なステップ一覧 |
| 更新頻度 | 3秒ポーリング | 手動リロード |

## 表示項目

- Overall status バッジ (running / completed / failed)
- プログレスバー (completedCount / totalCount)
- 各ステップ:
  - Blueprint / Implementation / Schema / API Design / File Split / Export
  - 色付きドット (green=completed, blue+pulse=running, red=failed, gray=pending)
  - status テキスト
- error_message (あれば赤背景で表示)

## helper: toGenerationProgress

- generation run → `GenerationProgress` に変換
- step status を正規化 (pending/running/completed/failed)
- step key → 日本語/英語ラベルに変換
- completedCount / totalCount / isActive を計算

## 将来の拡張候補

- **Server-Sent Events**: polling より効率的なリアルタイム更新
- **WebSocket**: 双方向通信が必要になった場合
- **Quality Gate progress**: generation 後の quality gate も同じ UI で追跡
- **Step duration**: 各ステップの所要時間を表示
- **Cancel**: 実行中の generation をキャンセル

## まだやらないこと

- SSE / WebSocket
- quality gate の progress 追跡
- ステップごとの所要時間表示
- キャンセル機能
- 新規 API endpoint の追加
