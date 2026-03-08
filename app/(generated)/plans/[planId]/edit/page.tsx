"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { MembershipPlanForm } from "@/components/domain/membership-plan-form";

export default function EditPlanPage() {
  const router = useRouter();
  const params = useParams<{ planId: string }>();
  const [initialValues, setInitialValues] = useState<any>(null);

  useEffect(() => {
    const run = async () => {
      const res = await fetch(
        `/api/domain/membership-plans/${params.planId}`
      );
      const json = await res.json();

      setInitialValues({
        name: json.plan.name,
        description: json.plan.description ?? "",
        price_id: json.plan.price_id ?? "",
        status: json.plan.status,
      });
    };

    run();
  }, [params.planId]);

  if (!initialValues) {
    return <main className="p-6">Loading...</main>;
  }

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Edit Plan</h1>

      <MembershipPlanForm
        initialValues={initialValues}
        submitLabel="更新する"
        onSubmit={async (values) => {
          const res = await fetch(
            `/api/domain/membership-plans/${params.planId}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(values),
            }
          );

          if (!res.ok) {
            const json = await res.json();
            alert(json.error || "更新に失敗しました");
            return;
          }

          router.push("/plans");
          router.refresh();
        }}
      />
    </main>
  );
}
