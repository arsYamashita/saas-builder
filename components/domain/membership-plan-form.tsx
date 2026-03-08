"use client";

import { useState } from "react";

type MembershipPlanFormValues = {
  name: string;
  description: string;
  price_id: string;
  status: string;
};

type Props = {
  initialValues?: MembershipPlanFormValues;
  submitLabel?: string;
  onSubmit: (values: MembershipPlanFormValues) => Promise<void>;
};

const defaultValues: MembershipPlanFormValues = {
  name: "",
  description: "",
  price_id: "",
  status: "active",
};

export function MembershipPlanForm({
  initialValues,
  submitLabel = "保存",
  onSubmit,
}: Props) {
  const [values, setValues] = useState<MembershipPlanFormValues>(
    initialValues ?? defaultValues
  );
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          await onSubmit(values);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div>
        <label className="block mb-1 text-sm font-medium">プラン名</label>
        <input
          className="w-full border rounded px-3 py-2"
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium">説明</label>
        <textarea
          className="w-full border rounded px-3 py-2 min-h-28"
          value={values.description}
          onChange={(e) =>
            setValues({ ...values, description: e.target.value })
          }
        />
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium">Stripe Price ID</label>
        <input
          className="w-full border rounded px-3 py-2"
          value={values.price_id}
          onChange={(e) => setValues({ ...values, price_id: e.target.value })}
        />
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium">状態</label>
        <select
          className="w-full border rounded px-3 py-2"
          value={values.status}
          onChange={(e) => setValues({ ...values, status: e.target.value })}
        >
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="draft">draft</option>
        </select>
      </div>

      <button
        disabled={loading}
        className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
      >
        {loading ? "保存中..." : submitLabel}
      </button>
    </form>
  );
}
