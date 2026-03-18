# Idea Discovery Engine — 設計書

## 概要

SaaS Builderの既存パイプライン前段に「アイデア発見」ステップを追加する。
日本市場のSNS/Q&Aサイトからニーズを自動収集し、AIで分析・テンプレートマッチングまで行う。

### 新パイプライン

```
[Data Ingestion] → [Idea Discovery] → [Needs Analysis] → User → Gemini (Blueprint) → ... 既存パイプライン
```

## 1. データソース（日本市場特化）

| ソース | 鮮度 | 品質 | 実装工数 | 用途 | 優先度 |
|--------|------|------|----------|------|--------|
| X (Twitter) | リアルタイム | 中 | 低 | トレンド検出 | 高 |
| はてなブックマーク | 週次 | 高 | 低 | キュレーション | 高 |
| Qiita | 日次 | 高 | 中 | 開発者インサイト | 高 |
| note.com | 週次 | 中 | 中 | クリエイターエコノミー | 中 |
| Reddit | 日次 | 中 | 低 | グローバルSaaSパターン | 中 |
| Yahoo!知恵袋 | 月次 | 高 | 高 | 深いペインポイント | 低 |

### X (Twitter)
- API: X API v2 (`/2/tweets/search/recent` + `lang:ja`)
- キーワード: `#SaaS`, `#起業`, `困っている`, `欲しい`, `ツールがあれば`
- コスト: $100-300/月
- 収集: 1時間ごとにサンプリング

### はてなブックマーク
- API: 公開REST API + RSS
- カテゴリ: テクノロジー, ビジネス, 起業
- コスト: 無料
- 収集: 日次で上位20記事

### Qiita
- API: `/api/v2/items` (要トークン)
- 収集: 日次でトレンド記事
- コスト: 無料

## 2. アーキテクチャ

```
lib/idea-discovery/
├── core/
│   ├── idea-discovery-engine.ts       # メインオーケストレーター
│   ├── idea-discovery-types.ts        # 型定義
│   └── idea-discovery-constants.ts    # 設定値
├── ingestion/
│   ├── data-source-adapter.ts         # アダプターインターフェース
│   ├── sources/
│   │   ├── twitter-adapter.ts
│   │   ├── hatena-adapter.ts
│   │   ├── yahoo-chiebukuro-adapter.ts
│   │   ├── reddit-adapter.ts
│   │   ├── note-adapter.ts
│   │   └── qiita-adapter.ts
│   ├── raw-idea-normalizer.ts
│   └── deduplication.ts
├── analysis/
│   ├── idea-analyzer.ts               # Gemini クイックフィルター
│   ├── needs-analyzer.ts              # Claude ディープ分析
│   ├── domain-classifier.ts
│   ├── urgency-scorer.ts
│   └── gap-detector.ts
├── matching/
│   ├── template-matcher.ts            # 既存テンプレートへのマッチング
│   ├── feature-extractor.ts
│   └── recommendation-engine.ts
├── storage/
│   ├── idea-store.ts                  # JSONファイルストレージ
│   └── idea-cache.ts
├── discovery-feed/
│   ├── feed-generator.ts
│   ├── feed-ranker.ts
│   └── feed-filter.ts
└── __tests__/
```

## 3. AI分析パイプライン

### Stage 1: Geminiクイックフィルター（安い・速い）
- 入力: 生テキスト (100-500文字)
- 目的: ノイズ除去, ドメイン分類
- コスト: ~¥0.01-0.05/アイデア
- モデル: Gemini Flash

### Stage 2: Claude ディープ分析（正確）
- 入力: Stage 1通過アイデア
- 目的: 構造化ニーズ抽出, テンプレートマッチング
- コスト: ~¥0.1-0.5/アイデア
- モデル: Claude Haiku or Sonnet

### データフロー

```
SNSデータソース → 正規化 → 重複排除 → Geminiフィルター → Claudeディープ分析 → テンプレートマッチング → フィード生成
```

## 4. 既存システムとの統合

### template-recommendation.ts
- `getRecommendations()` を拡張して発見アイデアからの入力を受付

### provider-router.ts
- 新タスク種別: `idea_quick_filter`, `idea_deep_analysis`

### Strategic KPI Layer
- 発見アイデア数, テンプレート利用率, プロジェクト作成率

### Template Marketplace
- ギャップ検出 → 新テンプレート提案

## 5. ストレージ

```
/data/idea-discoveries/
  ├── 2026-03-18/
  │   ├── raw-ideas-batch-001.json
  │   ├── analyzed-ideas-batch-001.json
  │   └── template-matches.json
  └── ...
```

## 6. 実装フェーズ

### Phase A: MVP (Week 1-2) — 60-80h
- Twitter + Qiita アダプター
- 正規化 + 重複排除
- Geminiクイックフィルター
- JSONストレージ
- 管理ダッシュボード

### Phase B: テンプレートマッチング (Week 3-4) — 50-70h
- Claude ディープ分析
- テンプレートマッチングエンジン
- ギャップ検出
- 「アイデアからプロジェクト作成」フロー

### Phase C: フィードランキング (Week 5) — 40-60h
- パーソナライゼーション
- ランキングアルゴリズム
- ユーザーエンゲージメントトラッキング

### Phase D: マーケットプレイス統合 (Week 6-7) — 50-70h
- KPIトラッキング
- 学習ループ
- 新テンプレート提案ワークフロー

## 7. コスト見積り

| 項目 | 月額コスト |
|------|-----------|
| Twitter API | $100-300 |
| Gemini API | ¥200-500 |
| Claude API | ¥500-1500 |
| インフラ | ¥100-200 |
| **合計** | ~¥900-4500 (~$6-30) |

## 8. 必要パッケージ

```json
{
  "cheerio": "^1.0.0-rc.12",
  "rss-parser": "^3.13.0",
  "twitter-api-v2": "^1.7.8",
  "node-cache": "^5.1.2"
}
```

既存の `@anthropic-ai/sdk`, `@google/generative-ai`, `@supabase/supabase-js` はそのまま使用。
