"use client";

import { useState } from "react";
import { defaultProjectFormValues } from "./defaultValues";
import { projectFormSchema } from "@/lib/validation/project-form";
import { membershipContentAffiliatePreset } from "@/lib/templates/membership-content-affiliate";
import { reservationSaasPreset } from "@/lib/templates/reservation-saas";

export default function NewProjectPage() {
  const [form, setForm] = useState(defaultProjectFormValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = projectFormSchema.safeParse(form);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result.data),
    });

    if (!res.ok) {
      alert("プロジェクト作成に失敗しました");
      return;
    }

    const json = await res.json();
    window.location.href = `/projects/${json.project.id}`;
  };

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">新規プロジェクト作成</h1>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">基本情報</h2>

          <div>
            <label className="block mb-1">サービス名</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {errors.name && <p className="text-red-500 text-sm">{errors.name}</p>}
          </div>

          <div>
            <label className="block mb-1">サービス概要</label>
            <textarea
              className="w-full border rounded px-3 py-2 min-h-28"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </div>

          <div>
            <label className="block mb-1">ターゲットユーザー</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.targetUsers}
              onChange={(e) => setForm({ ...form, targetUsers: e.target.value })}
            />
          </div>

          <div>
            <label className="block mb-1">解決したい課題</label>
            <textarea
              className="w-full border rounded px-3 py-2"
              value={form.problemToSolve}
              onChange={(e) =>
                setForm({ ...form, problemToSolve: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block mb-1">参考サービス</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.referenceServices}
              onChange={(e) =>
                setForm({ ...form, referenceServices: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block mb-1">ブランドトーン</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={form.brandTone}
              onChange={(e) =>
                setForm({ ...form, brandTone: e.target.value as any })
              }
            >
              <option value="modern">Modern</option>
              <option value="minimal">Minimal</option>
              <option value="luxury">Luxury</option>
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="playful">Playful</option>
            </select>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">機能要件</h2>

          <div>
            <label className="block mb-1">テンプレカテゴリ</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={form.templateKey}
              onChange={(e) => {
                const templateKey = e.target.value as any;

                if (templateKey === "membership_content_affiliate") {
                  setForm((prev) => ({
                    ...prev,
                    ...membershipContentAffiliatePreset,
                    templateKey,
                  }));
                  return;
                }

                if (templateKey === "reservation_saas") {
                  setForm((prev) => ({
                    ...prev,
                    ...reservationSaasPreset,
                    templateKey,
                  }));
                  return;
                }

                setForm({ ...form, templateKey });
              }}
            >
              <option value="membership_content_affiliate">
                会員サイト + コンテンツ販売 + アフィリエイト
              </option>
              <option value="reservation_saas">予約管理SaaS</option>
              <option value="online_salon">オンラインサロン</option>
              <option value="custom">カスタム</option>
            </select>
          </div>

          <div>
            <label className="block mb-1">課金方式</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={form.billingModel}
              onChange={(e) =>
                setForm({ ...form, billingModel: e.target.value as any })
              }
            >
              <option value="subscription">サブスクリプション</option>
              <option value="one_time">買い切り</option>
              <option value="hybrid">ハイブリッド</option>
              <option value="none">なし</option>
            </select>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.affiliateEnabled}
              onChange={(e) =>
                setForm({ ...form, affiliateEnabled: e.target.checked })
              }
            />
            アフィリエイトを有効化
          </label>

          <div>
            <label className="block mb-1">優先度</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={form.priority}
              onChange={(e) =>
                setForm({ ...form, priority: e.target.value as any })
              }
            >
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>

          <div>
            <label className="block mb-1">備考</label>
            <textarea
              className="w-full border rounded px-3 py-2"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </section>

        <button
          type="submit"
          className="rounded bg-black text-white px-4 py-2"
        >
          プロジェクトを作成
        </button>
      </form>
    </main>
  );
}
