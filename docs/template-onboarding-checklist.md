# Template Onboarding Checklist

新テンプレート追加時の最短手順。community_membership_saas を基準に作成。

## 自動化済み（registry 追加で自動反映）

以下はすべて `TEMPLATE_KEYS` + `TEMPLATE_MANIFESTS` に 1 エントリ追加するだけで動作する:

| 機能 | ファイル | 仕組み |
|------|---------|--------|
| TemplateKey 型 | `types/project.ts` | `RegisteredTemplateKey` を registry から import + 導出 |
| templateKey バリデーション | `lib/validation/project-form.ts` | `getRegisteredTemplateKeys()` から enum を自動導出 |
| テンプレ選択肢 (API) | `lib/templates/template-registry.ts` | `getTemplateOptions()` |
| shortName → baseline tag | `lib/templates/template-registry.ts` | `getTemplateShortName()` |
| プロンプト解決 | `lib/ai/template-prompt-resolver.ts` | `getTemplateEntry()` で finalPromptDir 参照 |
| ベースライン比較 | `scripts/compare-baseline.sh` | 統一スクリプト (baseline JSON ドリブン) |
| quality gates (共通) | `lib/db/quality-runs.ts` | `resolveQualityChecks()` — 共通 3 gates 自動適用 |
| promote API | `app/api/generation-runs/[runId]/promote/route.ts` | `getTemplateShortName()` |
| scoreboard | `app/api/scoreboard/route.ts` | `TEMPLATE_REGISTRY` からループ |

## 手動更新が必要なファイル（6 箇所）

### 必須 (最小限)

| # | ファイル | 作業内容 | 工数目安 |
|---|---------|---------|---------|
| 1 | `lib/templates/template-registry.ts` | `TEMPLATE_KEYS` に key 追加 + `TEMPLATE_MANIFESTS` に entry 追加 | 5 min |
| 2 | `lib/templates/<template-name>.ts` | プリセット値ファイル作成 | 10 min |
| 3 | `lib/templates/preset-map.ts` | import + `PRESET_MAP` にエントリ追加 | 2 min |
| 4 | `lib/templates/template-catalog.ts` | `TEMPLATE_CATALOG` に UI メタデータ追加 | 5 min |
| 5 | `lib/templates/template-recommendation.ts` | レコメンドルール追加 | 10 min |
| 6 | `prompts/final/<template_key>/` | 5 プロンプトファイル作成 (01〜05) | 2-4 hours |

### 推奨（GREEN 後に追加）

| # | ファイル | 作業内容 | 工数目安 |
|---|---------|---------|---------|
| 7 | `tests/baselines/<template>-green-v1.json` | ベースライン JSON 作成 | 15 min |
| 8 | `lib/validation/generation-inputs.ts` | Zod スキーマ + fields + registry 登録 | 20 min |
| 9 | `lib/projects/template-validation-messages.ts` | テンプレ別ガイダンス関数追加 | 10 min |
| 10 | `tests/fixtures/<template>-first-run.json` | テストフィクスチャ作成 | 10 min |
| 11 | `templates/<template_key>/manifest.json` | 16 セクション manifest 作成 | 30 min |
| 12 | `docs/rules/<template_key>/` | テンプレ固有ルールファイル | 1-2 hours |
| 13 | `package.json` | `regression:<short>` スクリプト追加 | 2 min |

## 更新不要（自動 or 対象外）

| ファイル | 理由 |
|---------|------|
| `types/project.ts` TemplateKey | `RegisteredTemplateKey` を registry から自動導出 |
| `lib/validation/project-form.ts` | `getRegisteredTemplateKeys()` で自動導出 |
| `app/(builder)/projects/new/page.tsx` | `PRESET_MAP` を `preset-map.ts` から import (page 変更不要) |
| `lib/db/quality-runs.ts` | 共通 gates は自動。`extraQualityGates` は manifest に任意追加 |
| `app/api/generation-runs/[runId]/promote/route.ts` | registry から shortName 自動解決 |
| `app/api/scoreboard/route.ts` | `TEMPLATE_REGISTRY` からループ |
| 各 generate-* route | `getTemplateEntry()` で解決 |

## 2 本目テンプレート追加の最短パス

```
1. TEMPLATE_KEYS に key 追加 + TEMPLATE_MANIFESTS にエントリ追加
2. プリセット .ts 作成 → preset-map.ts に登録
3. TEMPLATE_CATALOG + recommendation RULES 追加
4. prompts/final/<key>/ に 5 ファイル作成
5. 初回生成 → GREEN 確認
6. (GREEN 後) baseline, generation-inputs, validation-messages, manifest.json, fixture 追加
```

最短パス (1-4) で初回生成は動作する。5 の GREEN 確認後に 6 の資産化を進める。

## 残存リスク（低優先度）

| # | リスク | 影響 | 対策案 |
|---|-------|------|-------|
| R3 | quality gate ランナーが lint/typecheck/playwright 固定 | テンプレ固有テストを動的実行する仕組みがない | `extraQualityGates` 定義済みだがランナー未対応 |
| R4 | template-validation-messages.ts が switch 文 | テンプレ増で switch 肥大化 | manifest にガイダンスフィールド追加を検討 |
| R5 | regression スクリプトがまだ per-template | compare は統一済みだが run-*-regression.sh は個別 | 統一 run スクリプト作成 |
| R7 | Playwright E2E が全テンプレ共通仕様 | テンプレ固有のスモークテストが不足 | テンプレ別 spec ファイル or タグフィルタ |
