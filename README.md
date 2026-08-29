# SaaS Builder

AI SaaS Builder — SaaSに必要な共通機能を固定し、業務固有部分だけを生成する。

## Pipeline

```
User → Gemini (要件整理/Blueprint) → Claude (DB/API/権限/実装) → Lovable (UI) → Claude (統合) → Playwright (E2E) → Preview
```

## Tech Stack

- **Frontend**: Next.js / Tailwind / shadcn/ui
- **Backend**: Supabase (PostgreSQL / Auth / Storage) / Stripe
- **AI**: Gemini / Claude / Lovable / Playwright

## Setup

```bash
npm install
cp .env.example .env.local
# Fill in environment variables
npm run dev
```

## Fixed Common Core

Auth / Multi-tenant / RBAC / Stripe Billing / Affiliate / Audit Logs / Notifications / Admin Layout

## Fixed Roles

owner / admin / staff / member / affiliate_manager

## First Template

`membership_content_affiliate` — 会員サイト / コンテンツ販売 / 月額課金 / 紹介制度

## Production Deploy

`vercel.json` の `git.deploymentEnabled.main: false`（PR #55, 2026-08-29〜）により、`main` への push では本番デプロイが自動起動しなくなった（Preview デプロイと CI は従来どおり自動実行される）。本番へ反映するには、マージ後に手動で以下のいずれかを実行する: (1) Vercel CLI がログイン済みの環境で `vercel --prod` を実行、または (2) Vercel ダッシュボード（`saas-builder` プロジェクト）の Deployments から対象コミットを選び "Promote to Production"。本番URL: https://saas-builder-cyan.vercel.app
