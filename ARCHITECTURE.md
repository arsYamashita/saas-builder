# saas-builder アーキテクチャ

> 作成日: 2026-04-04

## 概要

saas-builder は複数プロダクトの共通基盤として機能するマルチテナント SaaS プラットフォームです。
認証・決済・コンテンツ管理・RBAC などの共通モジュールを提供し、
各プロダクトがテナントとして乗り入れる設計です。

## プロダクト別テナント構成

| テナント slug | プロダクト | 想定ユーザー | 状態 |
|---|---|---|---|
| aria-for-salon | aria-for-salon-app | 美容師・専門家 | 開発中 |
| day-care | day_care_web_app | 介護施設管理者 | 開発中 |
| ai-navigator | ai-business-navigator | 中小事業者 | 開発中 |

## 共通モジュール

### 認証（Auth）
- Supabase Auth（全テナント共通）
- `lib/auth/current-user.ts` — 現在ユーザー取得
- `lib/auth/signup-flow.ts` — サインアップフロー

### テナント管理
- `lib/tenant/current-tenant.ts` — 現在テナント取得
- `tenant_users` テーブルで RLS によるテナント分離
- ユーザーは複数テナントに所属可能

### 決済（Payments）
- Stripe（テナントごとにサブスクリプション）
- テナントごとの `stripe_customer_id`, `stripe_subscription_id` 管理
- `lib/billing/` — 決済ロジック

### データベース（DB）
- Supabase（テナント分離は RLS で実現）
- `supabase/migrations/0012_enable_rls.sql` — 全テーブル RLS 有効化
- `public.user_belongs_to_tenant(t_id)` ヘルパー関数でアクセス制御

### 監査ログ
- `audit_logs` テーブル（テナントごとに分離）
- `lib/audit/write-audit-log.ts`

## データベーススキーマ（主要テーブル）

```
tenants
  id, slug, name, plan, stripe_customer_id, stripe_subscription_id

tenant_users
  tenant_id -> tenants.id
  user_id -> auth.users.id
  role, status, joined_at

blueprints / implementation_runs / generated_files
  tenant_id で RLS 分離

audit_logs
  tenant_id, user_id, action, resource_type, resource_id
```

## Stripe サブスクリプション管理方針

- テナント作成時に Stripe Customer を生成し `tenants.stripe_customer_id` に保存
- プラン変更時は `tenants.plan` を更新し Stripe Subscription を同期
- Webhook で決済イベントを受信し、`tenants.plan` を自動更新

## 今後の統合方針

1. **短期**: saas-builder の API エンドポイントを `fetch()` で各プロダクトから呼び出す
2. **中期**: `@saas-builder/auth`, `@saas-builder/payments` として npm パッケージ化
3. **長期**: CLAN（aria-for-salon マーケットプレイス版）との統合

## CLAN / aria-app との関係

- `aria-for-salon-app`: 専門家側（サービス提供者）
- `aria-app`: ビジネスユーザー向け AI マーケティング自動化プラットフォーム（LINE連携）
- CLAN: aria-for-salon のマーケットプレイス版（構想中）
- saas-builder: 上記全プロダクトの認証・課金・テナント管理基盤
