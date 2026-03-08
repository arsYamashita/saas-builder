# Template Registry — Minimal Design

## Why

2テンプレ（MCA, RSV）が動く状態で、テンプレごとのメタデータが複数箇所に散在していた:

- prompt パス → `template-prompt-resolver.ts` にハードコード
- preset → `lib/templates/*.ts` に個別ファイル
- fixture/baseline パス → scripts にハードコード
- label → `new/page.tsx` にハードコード

3本目テンプレ追加時のミス防止のため、テンプレ定義を1か所に集約する。

## 今回 Registry に入れたもの

| 項目 | 用途 |
|------|------|
| templateKey | テンプレ識別子 |
| label | UI表示名 |
| finalPromptDir | final prompt のディレクトリ |
| finalPrompts | PromptKind → ファイル名マップ |
| prefixPrompt | Claude prefix prompt ファイル名 |
| rulesRoot | ルールファイルのディレクトリ |
| fixturePath | テスト用 fixture |
| baselineDocPath | baseline 文書 |
| baselineJsonPath | baseline JSON（正本） |
| regressionCommand | regression 実行コマンド |
| compareScriptPath | compare スクリプトパス |
| presetModule | preset ファイルパス（参照用） |

## まだ Registry に入れていないもの

- preset の値そのもの（型が異なるため個別ファイルに留置）
- scaffold 設定（共通コアのため template-specific ではない）
- AI モデル設定（現在は共通）
- quality gate 設定（現在は共通）
- export 設定（現在は共通）

## 3本目テンプレを足す時の手順

1. `TEMPLATE_REGISTRY` にエントリを追加（`lib/templates/template-registry.ts`）
2. `TemplateKey` 型に新キーを追加（同ファイル）
3. `prompts/final/{new_key}/` にプロンプト5本を配置
4. `docs/rules/{new_key}/` にルールファイルを配置
5. `lib/templates/{new-key}.ts` に preset を作成
6. `tests/fixtures/{new-key}-first-run.json` に fixture を作成
7. `tests/baselines/{new-key}-baseline-v0.json` に baseline を作成
8. `scripts/run-{abbr}-regression.sh` と `scripts/compare-{abbr}-baseline.sh` を作成
9. `package.json` に `regression:{abbr}` を追加
10. `app/(builder)/projects/new/page.tsx` に preset 接続を追加

## 既存 Baseline / Regression との関係

- Registry は metadata の集約のみ。baseline JSON の形式は変えない。
- regression / compare scripts は bash + jq のまま。Registry を参照しない。
- Registry の paths は scripts と一致させる必要がある（手動管理）。
- Registry を変更しても baseline comparison 結果は変わらない。

## ファイル構成

```
lib/templates/
  template-registry.ts          ← 定義の正本
  membership-content-affiliate.ts  ← MCA preset（変更なし）
  reservation-saas.ts              ← RSV preset（変更なし）

lib/ai/
  template-prompt-resolver.ts   ← registry を使って prompt path を解決
```
