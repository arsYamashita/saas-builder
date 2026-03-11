"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  endpoint: string;
  label?: string;
  confirmMessage?: string;
};

export function DeleteButton({
  endpoint,
  label = "Delete",
  confirmMessage = "本当に削除しますか？",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm(confirmMessage)) return;

    setLoading(true);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.error || "削除に失敗しました");
        return;
      }
      router.refresh();
    } catch {
      alert("削除に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-red-600 underline disabled:opacity-50"
    >
      {loading ? "..." : label}
    </button>
  );
}
