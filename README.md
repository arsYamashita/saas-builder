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
