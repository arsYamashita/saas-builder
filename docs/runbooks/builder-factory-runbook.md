# Builder Factory 運用手順書

## 1. 全体フロー

```
Design → Review → Generate → Step Review → Promote
```

| Phase | 操作 | 結果 |
|-------|------|------|
| **Design** | テンプレート選択 → Blueprint 生成 | PRD / エンティティ / 画面 / ロール / 課金 / アフィリエイト |
| **Review** | Blueprint 承認 (approve) | `blueprints.review_status = "approved"` |
| **Generate** | 1-Click Full Generation | 6 step pipeline 実行 → `generation_runs` レコード作成 |
| **Step Review** | 各 step を OK / NG | `steps_json[].meta.reviewStatus` 更新 |
| **Promote** | Baseline に昇格 | `baseline_promotions` レコード作成 |

### 6-Step Pipeline

```
blueprint → implementation → schema → api_design → split_files → export_files
```

| Step | Provider | TaskKind | Rerunnable |
|------|----------|----------|:----------:|
| blueprint | Gemini | intake+blueprint | NO (composite) |
| implementation | Claude | implementation | YES |
| schema | Claude | schema | YES |
| api_design | Claude | api_design | YES |
| split_files | Claude | file_split | YES |
| export_files | - | - | NO (no AI) |

---

## 2. 承認ルール

### Blueprint Approval

- **API**: `POST /api/projects/[projectId]/approve-blueprint`
- Blueprint を確認し、設計として妥当であれば承認する
- 承認しないと Baseline 昇格ができない

### Step-Level Review

- **API**: `POST /api/generation-runs/[runId]/review-step`
- Body: `{ stepKey, action: "approved"|"rejected", reason?: string }`
- completed な step のみレビュー可能
- reject 時は理由メモを記録できる（任意）

### Run Auto-Approve

全 completed step が approved になると、run の `review_status` が自動で `"approved"` になる。

| 状態 | 結果 |
|------|------|
| 全 step approved | run → **approved** (自動) |
| 1つでも pending/rejected | run → 変更なし |
| run が approved だったが step 変更で崩れた | run → **pending** (自動 revert) |

手動の run approve/reject API (`/approve`, `/reject`) も引き続き使用可能。

### Promote 条件

Baseline 昇格には**両方**が必要:

1. `generation_runs.review_status === "approved"`
2. 最新 `blueprints.review_status === "approved"`

どちらか不足 → 400 エラー（不足理由が返る）。

---

## 3. Rerun と Invalidation

### Step Rerun

- **API**: `POST /api/generation-runs/[runId]/rerun-step`
- Body: `{ stepKey }`
- rejected な step を個別に再実行できる
- blueprint と export_files は rerun 不可

### Downstream Invalidation

step を rerun すると、依存する downstream step の review が自動的に無効化される。

**依存グラフ:**

```
blueprint ──→ implementation ──→ split_files
    │                              ↑
    ├──→ schema ──→ api_design ────┘
    │        └──→ split_files
    └──→ api_design
    └──→ split_files
```

| Rerun した step | 無効化される downstream |
|----------------|----------------------|
| implementation | split_files |
| schema | api_design, split_files |
| api_design | split_files |
| split_files | (なし) |

**無効化されると:**
- `reviewStatus` → `"pending"`
- `reviewedAt` → クリア
- `invalidatedAt` / `invalidatedByStep` が記録される
- UI に "stale" バッジが表示される

**run への影響:**
- run が approved だった場合 → 自動で pending に戻る
- toast 通知が表示される

---

## 4. Scoreboard の見方

`/scoreboard` ページで各テンプレートの運用状態を確認できる。

| 指標 | 意味 |
|------|------|
| **Green Rate** | 生成成功率 (completed / total) |
| **Quality Pass** | 品質ゲート通過率 (lint + typecheck + playwright) |
| **Approved** | 承認済み run 数 |
| **Promoted** | Baseline 昇格済み run 数 + Promotion Rate (%) |
| **Blueprint Status** | 最新 blueprint の承認状態 |
| **Latest Baseline Tag** | 最新の baseline タグ名 |

---

## 5. よくある運用パターン

### 1 step だけ NG のとき

1. NG の step を確認（理由メモがあれば確認）
2. Re-run ボタンで再実行
3. 再実行後、その step と downstream step が "stale" (pending) に戻る
4. 新しい結果を確認して OK / NG を付ける
5. 全 step OK → run が自動承認される

### Rerun 後に pending に戻る理由

- rerun した step 自身が pending になる
- downstream step の review が invalidated になる
- run が approved だった場合、auto-revert で pending に戻る
- これは意図的な動作 — 古い結果への承認が残らないようにするため

### Promote できないとき

確認ポイント:

1. **run の review_status は?**
   - pending → 全 step を OK にする
   - rejected → step を rerun して再承認
2. **blueprint は承認済みか?**
   - UI に「昇格不可（Blueprint 未承認）」と表示される
   - `/api/projects/[id]/approve-blueprint` で承認する
3. **run の status は?**
   - completed でなければ promote 不可
   - running/failed の run は対象外

### 新しいテンプレートを追加したとき

1. `lib/templates/template-registry.ts` にエントリ追加
2. `tests/baselines/` にベースライン JSON 追加
3. 新テンプレートで Blueprint 生成 → Generate → Step Review → Promote の一連フローを確認
4. Scoreboard に新テンプレートが表示されることを確認

---

## 6. API 一覧

| Endpoint | Method | 役割 |
|----------|--------|------|
| `/api/projects/[projectId]/approve-blueprint` | POST | Blueprint 承認 |
| `/api/generation-runs/[runId]/approve` | POST | Run 手動承認 |
| `/api/generation-runs/[runId]/reject` | POST | Run 手動却下 |
| `/api/generation-runs/[runId]/promote` | POST | Baseline 昇格 |
| `/api/generation-runs/[runId]/review-step` | POST | Step レビュー |
| `/api/generation-runs/[runId]/rerun-step` | POST | Step 再実行 |
| `/api/scoreboard` | GET | Scoreboard データ取得 |

---

## 7. テスト体系

| カテゴリ | コマンド | 内容 |
|----------|---------|------|
| Unit Tests | `npm run test:unit` | 純粋ロジックのテスト (122 tests) |
| Playwright Smoke | `npm test` | UI 表示確認 |
| Quality Gate | 各 route 経由 | npm install → lint → typecheck → playwright |

### Unit Test 内訳

| Suite | テスト数 | 対象 |
|-------|---------|------|
| step-review.test.ts | 52 | step review / rerun / invalidation / auto-approve / promotion |
| factory-flow.test.ts | 22 | 全体フロー E2E シナリオ |
| task-router.test.ts | 16 | Provider routing |
| result-normalizer.test.ts | 19 | AI 結果パース |
| template-scoreboard.test.ts | 13 | Scoreboard 集計 |
