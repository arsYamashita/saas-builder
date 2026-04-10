# saas-builder 統合ガイド

`saas-builder` のコアモジュール（Auth / Billing / Dashboard / Notifications）を他プロジェクトに統合する手順。

---

## 対象プロジェクト

| プロジェクト | 統合ステータス |
|---|---|
| aria-for-salon-app | 予定 |
| aria-app | 予定 |
| day_care_web_app | 予定 |

---

## 必要な環境変数

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Stripe
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (Resend)
RESEND_API_KEY=re_...
NOTIFICATION_FROM_EMAIL=noreply@yourapp.com
```

---

## 1. Auth モジュール

**場所**: `lib/auth/` + `lib/db/supabase/`

### サーバーサイド（SSR）クライアント

```typescript
import { createClient } from "@/lib/db/supabase/server";

export async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
```

### セッション取得

```typescript
import { getAuthSession } from "@/lib/auth/session";

const { user } = await getAuthSession();
if (!user) redirect("/login");
```

### マルチテナント: tenant_id による行レベル分離

RLS は `supabase/migrations/0012_enable_rls.sql` で全テーブルに適用済み。
`tenant_users` テーブルで membership を管理し、`user_belongs_to_tenant()` 関数でポリシーを統一。

---

## 2. Billing モジュール

**場所**: `lib/billing/`

### Checkout Session 作成

```typescript
import { getStripeClient } from "@/lib/billing/stripe";
import { checkAccess } from "@/lib/billing/access";

const stripe = getStripeClient();
const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  payment_method_types: ["card"],
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: `${baseUrl}/billing/success`,
  cancel_url: `${baseUrl}/billing/cancel`,
  metadata: { tenant_id: tenantId, app_user_id: userId },
});
```

### Webhook（署名検証済み）

`app/api/stripe/webhook/route.ts` に実装済み。`constructEvent()` + idempotency check。

### アクセス権確認

```typescript
import { checkAccess } from "@/lib/billing/access";

const hasAccess = await checkAccess(tenantId, "feature_x");
```

---

## 3. Dashboard コンポーネント

**場所**: `components/dashboard/`

### レイアウト

```tsx
import { DashboardLayout, UsageSummaryCard } from "@/components/dashboard/layout";

export default function DashboardPage() {
  return (
    <DashboardLayout tenantName="My SaaS">
      <div className="p-6 grid grid-cols-3 gap-4">
        <UsageSummaryCard label="プロジェクト数" value={5} max={10} />
        <UsageSummaryCard label="API 呼び出し" value={2400} max={10000} unit="回" />
      </div>
    </DashboardLayout>
  );
}
```

### カスタム nav

```tsx
const nav = [
  { href: "/app/dashboard", label: "ホーム" },
  { href: "/app/salons", label: "サロン管理" },
  { href: "/app/billing", label: "プラン" },
];

<DashboardLayout nav={nav} tenantName="Aria for Salon">
  {/* カスタムコンテンツ */}
</DashboardLayout>
```

---

## 4. Notifications モジュール

**場所**: `lib/notifications/`

### メール送信

```typescript
import { sendEmail } from "@/lib/notifications/email";

await sendEmail({
  to: "user@example.com",
  subject: "ようこそ",
  html: "<p>アカウントが作成されました。</p>",
});
```

### サブスクリプション通知（テンプレート済み）

```typescript
import {
  sendSubscriptionActivatedEmail,
  sendSubscriptionCancelledEmail,
} from "@/lib/notifications/email";

await sendSubscriptionActivatedEmail(email, tenantName);
await sendSubscriptionCancelledEmail(email, tenantName, periodEndDate);
```

---

## 5. カスタマイズポイント

| 項目 | 変更方法 |
|---|---|
| カラーテーマ | Tailwind config の `primary` / `secondary` を上書き |
| テナント設定 | `lib/tenant/current-tenant.ts` で `tenantId` 解決ロジックを変更 |
| Sidebar nav | `DashboardLayout` の `nav` prop に配列を渡す |
| メールテンプレート | `lib/notifications/email.ts` の HTML を編集 |
| RLS ポリシー | `supabase/migrations/` に新しい `.sql` を追加 |

---

## 6. 統合チェックリスト

- [ ] `.env.local` に全環境変数を設定
- [ ] `supabase db push` で RLS マイグレーションを適用
- [ ] Stripe Webhook エンドポイントを Stripe Dashboard に登録
- [ ] `STRIPE_WEBHOOK_SECRET` を設定
- [ ] Resend で送信ドメインを認証（または `RESEND_API_KEY` を設定）
- [ ] `/dashboard` でレイアウトが表示されることを確認
