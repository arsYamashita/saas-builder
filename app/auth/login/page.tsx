"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);

  return (
    <main className="max-w-md mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Login</h1>

      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);

          try {
            const res = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(form),
            });

            const json = await res.json();

            if (!res.ok) {
              alert(json.error || "Login failed");
              return;
            }

            router.push(json.redirectTo || "/dashboard");
            router.refresh();
          } finally {
            setLoading(false);
          }
        }}
      >
        <div>
          <label className="block text-sm mb-1">メールアドレス</label>
          <input
            type="email"
            className="w-full border rounded px-3 py-2"
            value={form.email}
            onChange={(e) =>
              setForm({ ...form, email: e.target.value })
            }
          />
        </div>

        <div>
          <label className="block text-sm mb-1">パスワード</label>
          <input
            type="password"
            className="w-full border rounded px-3 py-2"
            value={form.password}
            onChange={(e) =>
              setForm({ ...form, password: e.target.value })
            }
          />
        </div>

        <button
          disabled={loading}
          className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>
      </form>
    </main>
  );
}
