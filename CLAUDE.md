# saas-builder

AI SaaS Builder — SaaS に必要な共通機能（Auth / Multi-tenant / RBAC / Stripe Billing / Affiliate / Audit Logs / Notifications / Admin Layout）を固定し、業務固有部分だけを AI パイプラインで生成する基盤。生成パイプラインは `User → Gemini(要件整理/Blueprint) → Claude(DB/API/権限/実装) → Lovable(UI) → Claude(統合) → Playwright(E2E) → Preview`。Next.js 14 (App Router) + Supabase (Postgres/Auth/Storage) + Stripe + Upstash Redis。ワークスペース構成 (`apps/*`, `packages/*`)。

## Build / Test / Deploy

```bash
npm install && cp .env.example .env.local   # setup
npm run dev / build / start / lint

npm run test:unit                # vitest
npm run test:e2e                 # playwright (chromium)
npm run test:e2e:auth            # playwright (logged-in project)
npm run test:ui                  # playwright UI mode
npm run test:cleanup             # E2E データ掃除 (scripts/cleanup-e2e-data.ts)

npm run regression:mca / rsv / crm / cms / iao   # テンプレート別リグレッション
npm run regression:nightly

npm run autopilot            # テンプレート自動生成パイプライン
npm run autopilot:dry        # --dry-run
npm run autopilot:live       # --live
```
デプロイは Vercel（`.vercel/` 管理下）。

## アーキテクチャの要点

- **`docs/rules/01`〜`11` が全テンプレート生成の共有契約**。特に `06-api-rules.md`（Route Handler / zod 検証 / tenant・role 境界強制 / mutation は audit log 必須というルール）と `08-db-rules.md`（既存テーブルが正、テーブル/カラムのリネーム禁止、tenant_id 境界必須）は、Gemini/Claude/Lovable のどの生成ステップも逸脱できない前提。新テンプレートを追加する時は必ずこの2ファイルを先に読む。
- **`lib/env.ts` が起動時に zod で env を必須化**（Supabase URL/anon/service-role key, Stripe secret/webhook/publishable key 等）。パースに失敗すると import 時に throw する設計 — 本番デプロイ前に対象 env が Vercel 側に実在するか必ず確認すること（下記「起動時 env 検証」参照）。
- **RLS は defense-in-depth、実運用は service-role 前提**。`supabase/migrations/0012_enable_rls.sql` 等で `auth.uid()` ベースの tenant RLS ポリシーは入っているが、実際の API ルートの大半（22/26）は `lib/db/supabase/admin.ts` の service-role クライアントでテナント境界をアプリ側コードで強制している。RLS だけを信用してテナント境界チェックを書かないこと。
- `templates/` に生成済みテンプレート、`prompts/` に生成用プロンプト、`plugins/` に共通機能プラグイン。`docs/integration-design.md` に CLAN/Aria との統合ロードマップ。

## 既知の落とし穴

- **起動時 env 検証で本番全断の前例あり**（`startup_env_validation_prod_outage`, critical, 解決済み）。env 必須化を「本番 env に実在するか」確認せずデプロイして全断した。`lib/env.ts` を変更する時は、対象 env が Vercel 本番プロジェクトに実際に設定されているか deploy 前に必ず確認する。
- **監査ログ実装が rule 通りに追いついていない**（`auto_scan_2026-05-24`, critical, 未解決）。`docs/rules/08` は「mutation は audit log 必須」と規定しているが、実装参照は3ファイルのみで薄い。新規 API を書く時は audit log 書き込みを自分で確認・追加すること。
- **決済系の冪等性キーが未実装**（`stripe_checkout_idempotency_key_missing`, `affiliate_commission_idempotency_missing`, ともに high, 未解決）。Stripe Checkout session 作成・アフィリエイトコミッション生成でリトライ/重複実行時に二重処理が起きうる。追加・変更時は idempotency key を入れる。
