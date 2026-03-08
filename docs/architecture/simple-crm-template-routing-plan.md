# simple_crm_saas Template Routing Plan

## Overview

simple_crm_saas を3本目テンプレとして接続するための最小変更計画。

## Prerequisites

- MCA regression: GREEN
- RSV regression: GREEN
- simple_crm_saas の template assets が全て揃っていること
  - prompts/final/simple_crm_saas/ (5本)
  - docs/rules/simple_crm_saas/ (3本)
  - lib/templates/simple-crm-saas.ts (preset)
  - tests/fixtures/simple-crm-first-run.json (fixture)
  - tests/baselines/simple-crm-baseline-v0.json (baseline draft)

## Step 1: Manifest に追加

対象: `lib/templates/template-registry.ts`

`TEMPLATE_MANIFESTS` 配列に以下を追加:

```typescript
{
  templateKey: "simple_crm_saas",
  label: "シンプルCRM",
  finalPromptDir: "final/simple_crm_saas",
  finalPrompts: FINAL_PROMPT_FILENAMES,
  prefixPrompt: "12-claude-membership-template-prefix.md", // TODO: CRM-specific prefix
  rulesRoot: "docs/rules/simple_crm_saas",
  fixturePath: "tests/fixtures/simple-crm-first-run.json",
  baselineDocPath: "docs/baselines/simple-crm-green-v1.md",
  baselineJsonPath: "tests/baselines/simple-crm-green-v1.json",
  regressionCommand: "npm run regression:crm",
  compareScriptPath: "scripts/compare-crm-baseline.sh",
  presetModule: "lib/templates/simple-crm-saas.ts",
}
```

これだけで prompt resolver は自動的に simple_crm_saas を解決する。
route ファイル群の変更は不要。

## Step 2: UI preset 接続

対象: `app/(builder)/projects/new/page.tsx`

```typescript
import { simpleCrmSaasPreset } from "@/lib/templates/simple-crm-saas";

// テンプレセレクターの onChange に追加:
if (templateKey === "simple_crm_saas") {
  setForm((prev) => ({ ...prev, ...simpleCrmSaasPreset, templateKey }));
  return;
}

// option を追加:
<option value="simple_crm_saas">シンプルCRM</option>
```

## Step 3: Regression infrastructure

作成するファイル:
- `scripts/run-crm-regression.sh`
- `scripts/compare-crm-baseline.sh`
- `package.json` に `"regression:crm": "bash scripts/run-crm-regression.sh"` 追加

## Step 4: First run

1. MCA regression を実行 → GREEN 確認
2. RSV regression を実行 → GREEN 確認
3. simple_crm_saas の project を作成 → generate-template
4. 結果を観察（まだ GREEN を期待しない）
5. MCA / RSV regression を再実行 → GREEN 確認

## 既存2テンプレ regression を先に回すルール

simple_crm_saas の接続作業の前後で必ず:
```bash
npm run regression:mca
npm run regression:rsv
```
を実行し、GREEN を確認すること。
