# Template Manifest — Minimal Spec

## Manifest とは

TemplateManifest は1つのテンプレートを記述する純粋データオブジェクト。
ロジックを持たず、パスや名前だけを定義する。

## Registry との違い

| | Manifest | Registry |
|---|---|---|
| 役割 | 1テンプレの定義データ | 全テンプレの索引 + ヘルパー関数 |
| 形 | `TemplateManifest` オブジェクト | `TEMPLATE_MANIFESTS` 配列 → `TEMPLATE_REGISTRY` Record |
| ロジック | なし | `getTemplateEntry()`, `isSupportedTemplate()`, `getTemplateOptions()` |

Registry は manifest 配列から自動的に構築される。
3本目テンプレ追加 = manifest 配列にオブジェクトを1つ追加するだけ。

## 最小必須項目

| 項目 | 型 | 説明 |
|------|------|------|
| templateKey | string | DB に保存される識別子 |
| label | string | UI 表示名 |
| finalPromptDir | string | prompts/ 以下の final prompt ディレクトリ |
| finalPrompts | Record<PromptKind, string> | PromptKind → ファイル名 |
| prefixPrompt | string | Claude prefix prompt ファイル名 |
| rulesRoot | string | ルールファイルのディレクトリ |
| fixturePath | string | テスト fixture パス |
| baselineDocPath | string | baseline 文書パス |
| baselineJsonPath | string | baseline JSON パス（compare script の正本） |
| regressionCommand | string | regression 実行コマンド |
| compareScriptPath | string | compare script パス |
| presetModule | string | preset ファイルパス（参照のみ） |

## まだ Manifest に入れていないもの

- preset の値そのもの（型が `Partial<ProjectFormValues>` で manifest の純粋データと混在させたくない）
- scaffold 設定（テンプレ共通）
- AI モデル設定（テンプレ共通）
- quality gate 設定（テンプレ共通）
- export パス規則（テンプレ共通）

## 3本目テンプレ追加時の手順

### Manifest 追加だけで済むもの

1. `TEMPLATE_MANIFESTS` 配列にオブジェクトを追加
   → `TemplateKey` 型、`TEMPLATE_REGISTRY`、`SUPPORTED_TEMPLATE_KEYS` は自動導出される

### コード変更が必要なもの

2. `prompts/final/{new_key}/` に prompt 5本を配置（ファイル作成）
3. `docs/rules/{new_key}/` にルールファイルを配置（ファイル作成）
4. `lib/templates/{new-key}.ts` に preset を作成（ファイル作成）
5. `app/(builder)/projects/new/page.tsx` に preset 接続を追加（コード変更）
6. `tests/fixtures/{new-key}-first-run.json` に fixture を作成（ファイル作成）
7. `tests/baselines/{new-key}-baseline-v0.json` に baseline を作成（ファイル作成）
8. `scripts/run-{abbr}-regression.sh` + `scripts/compare-{abbr}-baseline.sh` を作成（ファイル作成）
9. `package.json` に `regression:{abbr}` を追加（コード変更）

### コード変更が不要なもの

- `lib/ai/template-prompt-resolver.ts` — manifest から自動解決
- `lib/templates/template-registry.ts` — manifest 追加のみ（手順1）
- route ファイル群 — templateKey を DB から取得して resolver に渡すだけ
- scaffold / quality gate — テンプレ共通

## 現在の制約

- manifest は TypeScript コード内に定義（外部ファイル読み込みではない）
- preset は manifest 外の個別ファイル（型が異なるため）
- regression / compare scripts は bash で manifest を参照しない
- `new/page.tsx` の preset 接続は手動（動的 import 未導入）
