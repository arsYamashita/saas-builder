"use client";

import { useRouter } from "next/navigation";
import { MembershipPlanForm } from "@/components/domain/membership-plan-form";

export default function NewPlanPage() {
  const router = useRouter();

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">New Plan</h1>

      <MembershipPlanForm
        submitLabel="作成する"
        onSubmit={async (values) => {
          const res = await fetch("/api/domain/membership-plans", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(values),
          });

          if (!res.ok) {
            const json = await res.json();
            alert(json.error || "作成に失敗しました");
            return;
          }

          router.push("/plans");
          router.refresh();
        }}
      />
    </main>
  );
}
