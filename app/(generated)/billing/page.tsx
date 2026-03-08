"use client";

import { useEffect, useState } from "react";

export default function BillingPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);

  useEffect(() => {
    const run = async () => {
      const plansRes = await fetch("/api/domain/membership-plans");
      const plansJson = await plansRes.json();
      setPlans(plansJson.plans ?? []);

      const subRes = await fetch("/api/billing/subscriptions");
      const subJson = await subRes.json();
      setSubscriptions(subJson.subscriptions ?? []);
    };

    run();
  }, []);

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Billing</h1>

      <section className="border rounded-xl p-4">
        <h2 className="font-semibold mb-3">Available Plans</h2>

        <div className="space-y-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="border rounded-lg p-4 flex items-center justify-between gap-4"
            >
              <div>
                <p className="font-medium">{plan.name}</p>
                <p className="text-sm text-gray-500">{plan.description}</p>
                <p className="text-xs text-gray-500">
                  price_id: {plan.price_id || "-"}
                </p>
              </div>

              <button
                className="rounded bg-black text-white px-4 py-2"
                onClick={async () => {
                  const res = await fetch("/api/billing/checkout", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      membership_plan_id: plan.id,
                    }),
                  });

                  const json = await res.json();

                  if (!res.ok) {
                    alert(json.error || "Checkout failed");
                    return;
                  }

                  window.location.href = json.url;
                }}
              >
                Checkout
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded-xl p-4">
        <h2 className="font-semibold mb-3">Current Subscriptions</h2>

        <div className="space-y-3">
          {subscriptions.length ? (
            subscriptions.map((sub) => (
              <div key={sub.id} className="border rounded-lg p-4">
                <p className="font-medium">{sub.status}</p>
                <p className="text-sm text-gray-500">
                  {sub.current_period_start} - {sub.current_period_end}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">契約はまだありません。</p>
          )}
        </div>

        <button
          className="mt-4 rounded border px-4 py-2"
          onClick={async () => {
            const res = await fetch("/api/billing/portal", {
              method: "POST",
            });

            const json = await res.json();

            if (!res.ok) {
              alert(json.error || "Portal open failed");
              return;
            }

            window.location.href = json.url;
          }}
        >
          Open Customer Portal
        </button>
      </section>
    </main>
  );
}
