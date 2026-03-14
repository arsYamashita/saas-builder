"use client";

import { useCallback, useMemo, useState } from "react";
import { defaultProjectFormValues } from "./defaultValues";
import { projectFormSchema } from "@/lib/validation/project-form";
import { PRESET_MAP } from "@/lib/templates/preset-map";
import {
  TEMPLATE_CATALOG,
  getCatalogEntry,
} from "@/lib/templates/template-catalog";
import { getRecommendations } from "@/lib/templates/template-recommendation";
import {
  INTAKE_QUESTIONS,
  DEFAULT_INTAKE_ANSWERS,
  intakeToFormHints,
  type IntakeAnswers,
} from "@/lib/projects/project-intake-questions";
import {
  buildProjectDraft,
  previewDraft,
} from "@/lib/projects/project-draft-builder";
import { buildReviewSummary } from "@/lib/projects/project-review-summary";
import type { TemplateKey } from "@/types/project";
import { buildValidationSummary } from "@/lib/projects/project-validation-summary";
import { getTemplateGuidance } from "@/lib/projects/template-validation-messages";

export default function NewProjectPage() {
  const [form, setForm] = useState(defaultProjectFormValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [intake, setIntake] = useState<IntakeAnswers>(DEFAULT_INTAKE_ANSWERS);
  const [showDetails, setShowDetails] = useState(false);
  const [draftApplied, setDraftApplied] = useState<string[] | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  const selectedCatalog = getCatalogEntry(form.templateKey);

  const recommendations = useMemo(
    () =>
      getRecommendations({
        summary: form.summary || "",
        targetUsers: form.targetUsers || "",
        requiredFeatures: form.requiredFeatures || [],
        managedData: form.managedData || [],
        billingModel: form.billingModel || "none",
        affiliateEnabled: form.affiliateEnabled ?? false,
      }),
    [
      form.summary,
      form.targetUsers,
      form.requiredFeatures,
      form.managedData,
      form.billingModel,
      form.affiliateEnabled,
    ]
  );

  const draftPreview = useMemo(() => {
    const draft = buildProjectDraft(
      intake,
      form as unknown as Record<string, unknown>,
      recommendations
    );
    return previewDraft(draft, (key) => getCatalogEntry(key)?.label);
  }, [intake, form, recommendations]);

  const applyIntake = useCallback(
    (updated: IntakeAnswers) => {
      setIntake(updated);
      const hints = intakeToFormHints(updated);
      setForm((prev) => ({ ...prev, ...hints }));
    },
    []
  );

  const handleIntakeChange = (id: string, value: string | boolean) => {
    const updated = { ...intake, [id]: value };
    applyIntake(updated);
  };

  const handleTemplateChange = (key: string) => {
    const templateKey = key as TemplateKey;
    const preset = PRESET_MAP[key];
    if (preset) {
      setForm((prev) => ({ ...prev, ...preset, templateKey }));
    } else {
      setForm((prev) => ({ ...prev, templateKey }));
    }
  };

  const handleDraft = () => {
    const draft = buildProjectDraft(
      intake,
      form as unknown as Record<string, unknown>,
      recommendations
    );
    if (draft.filledFields.length === 0) {
      setDraftApplied([]);
      return;
    }
    // Apply templateKey via handleTemplateChange to also load preset
    if (draft.values.templateKey) {
      handleTemplateChange(draft.values.templateKey as string);
      const { templateKey: _, ...rest } = draft.values;
      setForm((prev) => ({ ...prev, ...rest }));
    } else {
      setForm((prev) => ({ ...prev, ...draft.values }));
    }
    setDraftApplied(draft.filledFields);
  };

  const handleRewrite = async () => {
    setRewriting(true);
    setRewriteError(null);
    try {
      const res = await fetch("/api/projects/rewrite-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: form.summary,
          problemToSolve: form.problemToSolve,
          targetUsers: form.targetUsers,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setRewriteError(json.error || "整形に失敗しました");
        return;
      }
      const data = await res.json();
      setForm((prev) => ({
        ...prev,
        summary: data.rewrittenSummary || prev.summary,
        problemToSolve: data.rewrittenProblemToSolve || prev.problemToSolve,
        targetUsers: data.rewrittenTargetUsers || prev.targetUsers,
      }));
    } catch {
      setRewriteError("通信エラーが発生しました");
    } finally {
      setRewriting(false);
    }
  };

  const canRewrite =
    !!(form.summary || form.problemToSolve || form.targetUsers) && !rewriting;

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
      setShowDetails(true);
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
        {/* --- かんたん入力 --- */}
        <section className="space-y-4 border rounded-lg p-5 bg-slate-50">
          <h2 className="text-lg font-semibold">かんたん入力</h2>
          <p className="text-sm text-gray-500">
            質問に答えると、下のフォームが自動で埋まります
          </p>

          {INTAKE_QUESTIONS.map((q) => (
            <div key={q.id}>
              <label className="block mb-1 font-medium text-sm">
                {q.question}
              </label>
              <p className="text-xs text-gray-400 mb-1">{q.helpText}</p>

              {q.type === "text" && (
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={(intake[q.id as keyof IntakeAnswers] as string) || ""}
                  onChange={(e) => handleIntakeChange(q.id, e.target.value)}
                  placeholder={q.helpText}
                />
              )}

              {q.type === "select" && q.options && (
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={(intake[q.id as keyof IntakeAnswers] as string) || ""}
                  onChange={(e) => handleIntakeChange(q.id, e.target.value)}
                >
                  <option value="">選択してください</option>
                  {q.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

              {q.type === "boolean" && (
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={q.id}
                      checked={intake[q.id as keyof IntakeAnswers] === true}
                      onChange={() => handleIntakeChange(q.id, true)}
                    />
                    はい
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={q.id}
                      checked={intake[q.id as keyof IntakeAnswers] !== true}
                      onChange={() => handleIntakeChange(q.id, false)}
                    />
                    いいえ
                  </label>
                </div>
              )}
            </div>
          ))}

          {/* --- draft preview + button --- */}
          {draftPreview.hasChanges && draftApplied === null && (
            <div className="border border-amber-200 rounded p-3 bg-amber-50 text-sm space-y-1.5">
              <p className="font-medium text-amber-800">
                下書きで埋まる項目:
              </p>
              <ul className="list-disc list-inside text-amber-900 space-y-0.5">
                {draftPreview.fields.map((f) => (
                  <li key={f.key}>{f.label}</li>
                ))}
              </ul>
              {draftPreview.suggestedTemplateLabel && (
                <p className="text-amber-700 text-xs">
                  おすすめテンプレート: {draftPreview.suggestedTemplateLabel}
                </p>
              )}
              <p className="text-xs text-amber-600">
                既存の入力は上書きしません
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              className="rounded bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              onClick={handleDraft}
              disabled={!draftPreview.hasChanges}
            >
              下書きを作る
            </button>
            {draftApplied !== null && (
              <span className="text-sm text-gray-600">
                {draftApplied.length > 0
                  ? `${draftApplied.length}件の項目を自動入力しました`
                  : "入力済みの項目が多いため、追加の自動入力はありません"}
              </span>
            )}
            {draftApplied === null && !draftPreview.hasChanges && (
              <span className="text-sm text-gray-400">
                自動入力できる空欄がありません
              </span>
            )}
          </div>
        </section>

        {/* --- テンプレ選択 + recommendation --- */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">テンプレート</h2>

          <div>
            <label className="block mb-1">テンプレカテゴリ</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={form.templateKey}
              onChange={(e) => handleTemplateChange(e.target.value)}
            >
              {TEMPLATE_CATALOG.map((t) => (
                <option key={t.templateKey} value={t.templateKey}>
                  {t.label}
                </option>
              ))}
              <option value="online_salon">オンラインサロン</option>
              <option value="custom">カスタム</option>
            </select>
          </div>

          {recommendations.length > 0 && (
            <div className="border border-blue-200 rounded p-3 bg-blue-50 space-y-2 text-sm">
              <p className="font-medium text-blue-800">
                おすすめテンプレート
              </p>
              {recommendations.map((rec, idx) => {
                const catalog = getCatalogEntry(rec.templateKey);
                const label = catalog?.label ?? rec.templateKey;
                const isSelected = form.templateKey === rec.templateKey;
                return (
                  <div
                    key={rec.templateKey}
                    className={`flex items-start gap-2 ${idx === 0 ? "" : "opacity-70"}`}
                  >
                    <span className="shrink-0 font-medium text-blue-700">
                      {idx + 1}.
                    </span>
                    <div className="flex-1">
                      <span className="font-medium">{label}</span>
                      {isSelected && (
                        <span className="ml-1.5 text-xs text-green-700">
                          (選択中)
                        </span>
                      )}
                      <span className="ml-1.5 text-xs text-blue-600">
                        スコア: {rec.score}
                      </span>
                      {!isSelected && (
                        <button
                          type="button"
                          className="ml-2 text-xs text-blue-600 underline hover:text-blue-800"
                          onClick={() => handleTemplateChange(rec.templateKey)}
                        >
                          選択
                        </button>
                      )}
                      <p className="text-gray-600 text-xs mt-0.5">
                        {rec.reasons.join(" / ")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedCatalog && (
            <div className="border rounded p-4 bg-gray-50 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{selectedCatalog.label}</span>
                <span className="inline-block px-1.5 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800">
                  {selectedCatalog.statusBadge}
                </span>
              </div>
              <p className="text-gray-700">
                {selectedCatalog.shortDescription}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
                <div>
                  <span className="font-medium">対象:</span>{" "}
                  {selectedCatalog.targetUsers}
                </div>
                <div>
                  <span className="font-medium">推奨:</span>{" "}
                  {selectedCatalog.recommendedFor}
                </div>
                <div>
                  <span className="font-medium">主要エンティティ:</span>{" "}
                  {selectedCatalog.coreEntities.join(", ")}
                </div>
                <div>
                  <span className="font-medium">課金:</span>{" "}
                  {selectedCatalog.includesBilling ? "あり" : "なし"}
                  {" / "}
                  <span className="font-medium">アフィリエイト:</span>{" "}
                  {selectedCatalog.includesAffiliate ? "あり" : "なし"}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* --- サービス名（常に表示） --- */}
        <section className="space-y-4">
          <div>
            <label className="block mb-1">サービス名</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {errors.name && (
              <p className="text-red-500 text-sm">{errors.name}</p>
            )}
          </div>
        </section>

        {/* --- 詳細設定（トグル） --- */}
        <div>
          <button
            type="button"
            className="text-sm text-gray-500 underline hover:text-gray-700"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? "詳細設定を閉じる" : "詳細設定を開く"}
          </button>
        </div>

        {showDetails && (
          <>
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">基本情報（詳細）</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded border border-purple-300 bg-purple-50 text-purple-700 px-3 py-1.5 text-xs font-medium hover:bg-purple-100 disabled:opacity-50"
                    onClick={handleRewrite}
                    disabled={!canRewrite}
                  >
                    {rewriting ? "整形中..." : "AIで整える"}
                  </button>
                  {rewriteError && (
                    <span className="text-xs text-red-500">{rewriteError}</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block mb-1">サービス概要</label>
                <textarea
                  className="w-full border rounded px-3 py-2 min-h-28"
                  value={form.summary}
                  onChange={(e) =>
                    setForm({ ...form, summary: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block mb-1">ターゲットユーザー</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={form.targetUsers}
                  onChange={(e) =>
                    setForm({ ...form, targetUsers: e.target.value })
                  }
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
              <h2 className="text-lg font-semibold">機能要件（詳細）</h2>

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
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                />
              </div>
            </section>
          </>
        )}

        {/* --- 作成前レビュー --- */}
        <section className="border rounded-lg p-5 bg-gray-50 space-y-3">
          <h2 className="text-lg font-semibold">この内容でプロジェクトを作成します</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {buildReviewSummary(
              form as unknown as Record<string, unknown>,
              selectedCatalog?.label
            ).items.map((ri) => (
              <div key={ri.label} className="contents">
                <dt className="font-medium text-gray-600">{ri.label}</dt>
                <dd className={ri.empty ? "text-gray-400 italic" : "text-gray-900"}>
                  {ri.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* --- validation summary --- */}
        {(() => {
          const vs = buildValidationSummary(
            form as unknown as Record<string, unknown>
          );
          if (vs.missingItems.length === 0) {
            return (
              <div className="border border-green-200 rounded-lg p-4 bg-green-50 text-sm text-green-800">
                このまま作成できます
              </div>
            );
          }
          return (
            <div
              className={`border rounded-lg p-4 text-sm space-y-2 ${
                vs.isReady
                  ? "border-amber-200 bg-amber-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <p
                className={`font-medium ${
                  vs.isReady ? "text-amber-800" : "text-red-800"
                }`}
              >
                {vs.isReady
                  ? "入力を推奨する項目があります"
                  : "作成前に確認してください"}
              </p>
              <ul className="space-y-1">
                {vs.missingItems.map((mi) => (
                  <li
                    key={mi.key}
                    className={
                      vs.isReady ? "text-amber-700" : "text-red-700"
                    }
                  >
                    <span className="font-medium">{mi.label}:</span>{" "}
                    {mi.message}
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {/* --- template guidance --- */}
        {(() => {
          const guidance = getTemplateGuidance(
            form.templateKey,
            form as unknown as Record<string, unknown>
          );
          if (!guidance || guidance.messages.length === 0) return null;
          return (
            <div className="border border-indigo-200 rounded-lg p-4 bg-indigo-50 text-sm space-y-1.5">
              <p className="font-medium text-indigo-800">{guidance.title}</p>
              <ul className="list-disc list-inside text-indigo-700 space-y-0.5">
                {guidance.messages.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          );
        })()}

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
