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
  CreditCard,
  ExternalLink,
  Loader2,
  Receipt,
  Sparkles,
} from "lucide-react";

export default function BillingPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        const plansRes = await fetch("/api/domain/membership-plans");
        const plansJson = await plansRes.json();
        setPlans(plansJson.plans ?? []);

        const subRes = await fetch("/api/billing/subscriptions");
        const subJson = await subRes.json();
        setSubscriptions(subJson.subscriptions ?? []);
      } finally {
        setLoading(false);
      }
    };

    run();
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

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="課金管理"
        description="サブスクリプションプランと支払い方法を管理します。"
      />

      {/* Available Plans */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">
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
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className="flex flex-col transition-all duration-200 hover:shadow-card-hover"
              >
                <CardHeader>
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {plan.description && (
                    <CardDescription>{plan.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex-1">
                  {plan.price_id && (
                    <p className="mb-4 text-xs text-muted-foreground font-mono">
                      {plan.price_id}
                    </p>
                  )}
                  <Button
                    className="w-full"
                    onClick={() => handleCheckout(plan.id)}
                    disabled={checkoutLoading !== null}
                  >
                    {checkoutLoading === plan.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                    登録する
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Current Subscriptions */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground/60">
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
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium capitalize">
                          {sub.status}
                        </p>
                        <Badge
                          variant={
                            sub.status === "active" ? "success" : "warning"
                          }
                          className="capitalize"
                        >
                          {sub.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {sub.current_period_start} - {sub.current_period_end}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-4">
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
        </div>
      </div>
    </div>
  );
}
