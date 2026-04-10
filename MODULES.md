# saas-builder モジュール一覧

## 既存モジュール

- `lib/auth/` — 認証・セッション管理 (current-user.ts, session.ts, signup-flow.ts)
- `lib/billing/` — Stripe Billing
- `lib/notifications/email.ts` — メール通知

## 2026-04-05 追加

### components/dashboard/
- `DashboardShell` — テナント共通レイアウト
- `StatsCard` — KPI カード表示コンポーネント
- 使用例: `import { DashboardShell, StatsCard } from "@/components/dashboard"`

### lib/notifications/inbox.ts
- `createInboxNotification` — Supabase DB インボックス通知
- `NotificationProvider` インターface — 各プロジェクトが実装
- マイグレーション: `supabase/migrations/002_notifications.sql`
