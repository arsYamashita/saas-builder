"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  Receipt,
  Sparkles,
  Trash2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BillingPriceSummary = {
  id: string;
  stripe_price_id: string | null;
  amount: number;
  currency: string;
  interval: "month" | "year" | null;
  interval_count: number | null;
  trial_days: number | null;
  status: string;
};

type MembershipPlan = {
  id: string;
  name: string;
  description?: string | null;
  price_id: string | null;
  status: string;
  billing_prices?: BillingPriceSummary | BillingPriceSummary[] | null;
};

type Subscription = {
  id: string;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(price: BillingPriceSummary): string {
  const amount = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(price.amount);

  const intervalLabel =
    price.interval === "month"
      ? "/ 月"
      : price.interval === "year"
        ? "/ 年"
        : "";

  return `${amount}${intervalLabel ? " " + intervalLabel : ""}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getActiveBillingPrice(
  billing_prices: BillingPriceSummary | BillingPriceSummary[] | null | undefined
): BillingPriceSummary | null {
  if (!billing_prices) return null;
  if (Array.isArray(billing_prices)) {
    return billing_prices.find((p) => p.status === "active") ?? null;
  }
  return billing_prices.status === "active" ? billing_prices : null;
}

/** Return true if the user has an active/trialing subscription that matches this plan's price. */
function isCurrentPlan(
  plan: MembershipPlan,
  subscriptions: Subscription[]
): boolean {
  const activePrice = getActiveBillingPrice(plan.billing_prices);
  if (!activePrice?.stripe_price_id) return false;
  return subscriptions.some(
    (s) =>
      s.stripe_price_id === activePrice.stripe_price_id &&
      (s.status === "active" || s.status === "trialing")
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BillingPage() {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [plansRes, subRes] = await Promise.all([
        fetch("/api/domain/membership-plans"),
        fetch("/api/billing/subscriptions"),
      ]);
      const plansJson = await plansRes.json();
      const subJson = await subRes.json();
      setPlans(plansJson.plans ?? []);
      setSubscriptions(subJson.subscriptions ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCheckout = async (planId: string) => {
    setCheckoutLoading(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership_plan_id: planId }),
      });

      const json = await res.json();

      if (!res.ok) {
        alert(json.error || "チェックアウトに失敗しました");
        return;
      }

      window.location.href = json.url;
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json();

      if (!res.ok) {
        alert(json.error || "ポータルを開けませんでした");
        return;
      }

      window.location.href = json.url;
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("サブスクリプションをキャンセルしますか？現在の期間終了まで引き続きご利用いただけます。")) {
      return;
    }
    setCancelLoading(true);
    try {
      const res = await fetch("/api/billing/subscriptions", { method: "DELETE" });
      const json = await res.json();

      if (!res.ok) {
        alert(json.error || "キャンセルに失敗しました");
        return;
      }

      // Refresh subscription list to reflect cancel_at_period_end=true
      await fetchData();
    } finally {
      setCancelLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    );
  }

  const hasActiveSub = subscriptions.some(
    (s) =>
      (s.status === "active" || s.status === "trialing") &&
      !s.cancel_at_period_end
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="課金管理"
        description="サブスクリプションプランと支払い方法を管理します。"
      />

      {/* Available Plans */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          利用可能なプラン
        </h2>
        {plans.length === 0 ? (
          <Card>
            <EmptyState
              icon={Sparkles}
              title="利用可能なプランがありません"
              description="プランが設定されると、ここに表示されます。"
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const activePrice = getActiveBillingPrice(plan.billing_prices);
              const isCurrent = isCurrentPlan(plan, subscriptions);
              return (
                <Card
                  key={plan.id}
                  className={`flex flex-col transition-all duration-200 hover:shadow-card-hover ${
                    isCurrent ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      {isCurrent && (
                        <Badge variant="success" className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          現在のプラン
                        </Badge>
                      )}
                    </div>
                    {plan.description && (
                      <CardDescription>{plan.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-4">
                    {activePrice ? (
                      <div className="space-y-1">
                        <p className="text-2xl font-bold tracking-tight">
                          {formatPrice(activePrice)}
                        </p>
                        {activePrice.trial_days && activePrice.trial_days > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {activePrice.trial_days}日間無料トライアル
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        料金情報未設定
                      </p>
                    )}
                    {!isCurrent && (
                      <Button
                        className="w-full mt-auto"
                        onClick={() => handleCheckout(plan.id)}
                        disabled={checkoutLoading !== null || !activePrice}
                      >
                        {checkoutLoading === plan.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CreditCard className="h-4 w-4" />
                        )}
                        登録する
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Current Subscriptions */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          現在のサブスクリプション
        </h2>
        {subscriptions.length === 0 ? (
          <Card>
            <EmptyState
              icon={Receipt}
              title="アクティブなサブスクリプションはありません"
              description="プランに登録して始めましょう。"
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {subscriptions.map((sub) => (
              <Card key={sub.id}>
                <CardContent className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <Receipt className="h-5 w-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            sub.status === "active" || sub.status === "trialing"
                              ? "success"
                              : "warning"
                          }
                          className="capitalize"
                        >
                          {sub.status === "active"
                            ? "有効"
                            : sub.status === "trialing"
                              ? "トライアル中"
                              : sub.status === "canceled"
                                ? "キャンセル済み"
                                : sub.status}
                        </Badge>
                        {sub.cancel_at_period_end && (
                          <Badge variant="warning" className="flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            期間終了でキャンセル
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(sub.current_period_start)} -{" "}
                        {formatDate(sub.current_period_end)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handlePortal}
            disabled={portalLoading}
          >
            {portalLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            カスタマーポータルを開く
          </Button>

          {hasActiveSub && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelLoading}
            >
              {cancelLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              サブスクリプションをキャンセル
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
