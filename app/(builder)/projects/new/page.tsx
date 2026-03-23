"use client";

import { useCallback, useMemo, useState } from "react";
import { defaultProjectFormValues } from "./defaultValues";
import { projectFormSchema } from "@/lib/validation/project-form";
import { PRESET_MAP } from "@/lib/templates/preset-map";
import {
  TEMPLATE_CATALOG,
  getCatalogEntry,
  type TemplateCatalogEntry,
} from "@/lib/templates/template-catalog";
import type { TemplateKey } from "@/types/project";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";

/* ---------- Template icon mapping ---------- */
const TEMPLATE_ICONS: Record<string, string> = {
  membership_content_affiliate: "M",
  reservation_saas: "R",
  community_membership_saas: "C",
  simple_crm_saas: "S",
  internal_admin_ops_saas: "O",
  custom: "+",
};

/* ---------- Template-aware defaults for problemToSolve ---------- */
const TEMPLATE_PROBLEM_DEFAULTS: Record<string, string> = {
  membership_content_affiliate:
    "会員管理やコンテンツ販売の仕組みを効率的に構築したい",
  reservation_saas: "予約の管理や顧客対応を効率化したい",
  community_membership_saas:
    "コミュニティの運営と会員管理を一元化したい",
  simple_crm_saas: "顧客情報や営業プロセスを効率的に管理したい",
  internal_admin_ops_saas:
    "社内の業務プロセスや承認フローを効率化したい",
};

/* ---------- Step definitions ---------- */
const STEPS = [
  { number: 1, label: "テンプレート選択" },
  { number: 2, label: "基本情報" },
  { number: 3, label: "確認して作成" },
] as const;

type StepNumber = 1 | 2 | 3;

/* ---------- Main Component ---------- */
export default function NewProjectPage() {
  const [currentStep, setCurrentStep] = useState<StepNumber>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [targetUsers, setTargetUsers] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* ---------- Derived catalog entry ---------- */
  const selectedCatalog = useMemo(
    () => (selectedTemplate ? getCatalogEntry(selectedTemplate) : null),
    [selectedTemplate]
  );

  /* ---------- Navigation ---------- */
  const canGoNext = useCallback((): boolean => {
    if (currentStep === 1) return selectedTemplate !== null;
    if (currentStep === 2) return name.trim().length >= 2 && summary.trim().length >= 10;
    return false;
  }, [currentStep, selectedTemplate, name, summary]);

  const goNext = () => {
    if (currentStep === 2) {
      const newErrors: Record<string, string> = {};
      if (name.trim().length < 2) newErrors.name = "サービス名は2文字以上で入力してください";
      if (summary.trim().length < 10) newErrors.summary = "サービス概要は10文字以上で入力してください";
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
      setErrors({});
    }
    if (currentStep < 3) setCurrentStep((s) => (s + 1) as StepNumber);
  };

  const goBack = () => {
    if (currentStep > 1) setCurrentStep((s) => (s - 1) as StepNumber);
  };

  /* ---------- Template selection ---------- */
  const handleTemplateSelect = (key: string) => {
    setSelectedTemplate(key);
  };

  /* ---------- Build full form payload from wizard state ---------- */
  const buildPayload = useCallback(() => {
    const base = { ...defaultProjectFormValues };
    const templateKey = (selectedTemplate || "custom") as TemplateKey;

    // Apply preset if available
    const preset = PRESET_MAP[templateKey];
    if (preset) {
      Object.assign(base, preset);
    }

    // Override with user-entered values
    base.templateKey = templateKey;
    base.name = name.trim();
    base.summary = summary.trim();
    base.targetUsers = targetUsers.trim() || selectedCatalog?.targetUsers || "一般ユーザー";

    // Auto-fill problemToSolve from template if not customized
    if (!base.problemToSolve || base.problemToSolve === defaultProjectFormValues.problemToSolve) {
      base.problemToSolve =
        TEMPLATE_PROBLEM_DEFAULTS[templateKey] ||
        `${base.name}を通じてユーザーの課題を解決したい`;
    }

    return base;
  }, [selectedTemplate, name, summary, targetUsers, selectedCatalog]);

  /* ---------- Submit ---------- */
  const handleSubmit = async () => {
    const payload = buildPayload();
    const result = projectFormSchema.safeParse(payload);

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
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      if (!res.ok) {
        setSubmitError("プロジェクト作成に失敗しました");
        return;
      }

      const json = await res.json();
      window.location.href = `/projects/${json.project.id}`;
    } catch {
      setSubmitError("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Progress percentage ---------- */
  const progressPercent = (currentStep / 3) * 100;

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 sm:py-12">
        {/* ===== Header ===== */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            新規プロジェクト作成
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            3つのステップでプロジェクトを作成します
          </p>
        </div>

        {/* ===== Step Indicator ===== */}
        <div className="mb-8">
          {/* Progress bar */}
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-4">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Step labels */}
          <div className="flex justify-between">
            {STEPS.map((step) => (
              <div
                key={step.number}
                className={cn(
                  "flex items-center gap-2 text-sm transition-colors",
                  currentStep >= step.number
                    ? "text-primary font-medium"
                    : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-all",
                    currentStep > step.number
                      ? "bg-primary text-primary-foreground"
                      : currentStep === step.number
                        ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {currentStep > step.number ? (
                    <CheckIcon />
                  ) : (
                    step.number
                  )}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ===== Step Content ===== */}
        <div className="min-h-[400px]">
          {/* ---------- Step 1: Template Selection ---------- */}
          {currentStep === 1 && (
            <section className="space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  テンプレートを選択
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  プロジェクトの種類に合ったテンプレートを選んでください。
                  テンプレートに応じて最適な設定が自動で適用されます。
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {TEMPLATE_CATALOG.map((template) => (
                  <TemplateCard
                    key={template.templateKey}
                    template={template}
                    selected={selectedTemplate === template.templateKey}
                    onSelect={() => handleTemplateSelect(template.templateKey)}
                  />
                ))}

                {/* Custom option */}
                <button
                  type="button"
                  onClick={() => handleTemplateSelect("custom")}
                  className="w-full text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-xl"
                  aria-pressed={selectedTemplate === "custom"}
                >
                  <Card
                    className={cn(
                      "cursor-pointer transition-all duration-200 hover:shadow-md",
                      selectedTemplate === "custom"
                        ? "ring-2 ring-primary border-primary"
                        : "hover:border-primary/40"
                    )}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold transition-colors",
                            selectedTemplate === "custom"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          +
                        </div>
                      </div>
                      <CardTitle className="mt-2">カスタム</CardTitle>
                      <CardDescription>
                        テンプレートを使わず、ゼロからプロジェクトを構成します
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </button>
              </div>
            </section>
          )}

          {/* ---------- Step 2: Basic Info ---------- */}
          {currentStep === 2 && (
            <section className="space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  基本情報を入力
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  サービスの概要を教えてください。AIが詳細なブループリントを自動生成します。
                </p>
              </div>

              {/* Selected template reminder */}
              {selectedCatalog && (
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3 text-sm">
                  <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                    {TEMPLATE_ICONS[selectedCatalog.templateKey] || "T"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">
                      {selectedCatalog.label}
                    </span>
                    <span className="text-muted-foreground ml-2">を使用</span>
                  </div>
                </div>
              )}

              <div className="space-y-5">
                {/* Service name */}
                <div className="space-y-2">
                  <label
                    htmlFor="service-name"
                    className="block text-sm font-medium text-foreground"
                  >
                    サービス名 <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="service-name"
                    aria-describedby={errors.name ? "service-name-error" : undefined}
                    aria-invalid={!!errors.name}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例: マイCRM"
                    className="h-12 text-base"
                  />
                  {errors.name && (
                    <p id="service-name-error" className="text-sm text-destructive">{errors.name}</p>
                  )}
                </div>

                {/* Summary */}
                <div className="space-y-2">
                  <label
                    htmlFor="service-summary"
                    className="block text-sm font-medium text-foreground"
                  >
                    サービスの概要 <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    id="service-summary"
                    aria-describedby={errors.summary ? "service-summary-error" : "service-summary-hint"}
                    aria-invalid={!!errors.summary}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="例: 中小企業向けの顧客管理システム。連絡先、商談、活動履歴を一元管理し、営業効率を向上させるSaaSサービス。"
                    className="min-h-[120px] text-base leading-relaxed"
                  />
                  <p id="service-summary-hint" className="text-xs text-muted-foreground">
                    どんなサービスで、誰のどんな課題を解決するか教えてください（10文字以上）
                  </p>
                  {errors.summary && (
                    <p id="service-summary-error" className="text-sm text-destructive">{errors.summary}</p>
                  )}
                </div>

                {/* Target users */}
                <div className="space-y-2">
                  <label
                    htmlFor="target-users"
                    className="block text-sm font-medium text-foreground"
                  >
                    ターゲットユーザー
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      任意
                    </span>
                  </label>
                  <Input
                    id="target-users"
                    value={targetUsers}
                    onChange={(e) => setTargetUsers(e.target.value)}
                    placeholder={
                      selectedCatalog?.targetUsers ||
                      "例: 中小企業の営業チーム"
                    }
                    className="h-12 text-base"
                  />
                  <p className="text-xs text-muted-foreground">
                    未入力の場合、テンプレートの推奨ターゲットが使用されます
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ---------- Step 3: Review & Create ---------- */}
          {currentStep === 3 && (
            <section className="space-y-6 animate-in fade-in duration-300">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  内容を確認して作成
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  以下の内容でプロジェクトを作成します。
                </p>
              </div>

              {/* Review card */}
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <ReviewRow
                    label="テンプレート"
                    value={
                      selectedTemplate === "custom"
                        ? "カスタム（テンプレートなし）"
                        : selectedCatalog?.label || selectedTemplate || ""
                    }
                  />
                  <ReviewRow label="サービス名" value={name} />
                  <ReviewRow label="サービス概要" value={summary} />
                  <ReviewRow
                    label="ターゲットユーザー"
                    value={
                      targetUsers ||
                      selectedCatalog?.targetUsers ||
                      "一般ユーザー"
                    }
                    muted={!targetUsers}
                  />
                  {selectedCatalog && (
                    <>
                      <div className="border-t pt-4 mt-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                          テンプレートから自動設定
                        </p>
                        <div className="space-y-3">
                          <ReviewRow
                            label="課金"
                            value={selectedCatalog.includesBilling ? "あり" : "なし"}
                          />
                          <ReviewRow
                            label="アフィリエイト"
                            value={selectedCatalog.includesAffiliate ? "あり" : "なし"}
                          />
                          <ReviewRow
                            label="主要エンティティ"
                            value={selectedCatalog.coreEntities.join(", ")}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* AI explanation */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <SparklesIcon />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      AIがブループリントを自動生成します
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      テンプレートと入力情報をもとに、データベース設計、API仕様、
                      画面構成などの技術ブループリントが自動で生成されます。
                      作成後にいつでも編集できます。
                    </p>
                  </div>
                </div>
              </div>

              {/* Validation errors */}
              {Object.keys(errors).length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive space-y-1">
                  <p className="font-medium">入力内容にエラーがあります</p>
                  {Object.entries(errors).map(([key, message]) => (
                    <p key={key}>{message}</p>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* ===== Submit Error ===== */}
        {submitError && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {submitError}
          </div>
        )}

        {/* ===== Navigation Buttons ===== */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t">
          <div>
            {currentStep > 1 && (
              <Button
                variant="outline"
                size="lg"
                onClick={goBack}
                className="min-w-[100px]"
              >
                戻る
              </Button>
            )}
          </div>

          <div>
            {currentStep < 3 ? (
              <Button
                size="lg"
                onClick={goNext}
                disabled={!canGoNext()}
                className="min-w-[140px]"
              >
                次へ
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={handleSubmit}
                disabled={submitting}
                className="min-w-[180px]"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner />
                    作成中...
                  </span>
                ) : (
                  "プロジェクトを作成"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/* ========== Sub-components ========== */

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: TemplateCatalogEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const icon = TEMPLATE_ICONS[template.templateKey] || "T";

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-xl"
      aria-pressed={selected}
    >
      <Card
        className={cn(
          "cursor-pointer transition-all duration-200 hover:shadow-md",
          selected
            ? "ring-2 ring-primary border-primary"
            : "hover:border-primary/40"
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold transition-colors",
                selected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {icon}
            </div>
            {template.statusBadge === "GREEN" && (
              <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                おすすめ
              </span>
            )}
          </div>
          <CardTitle className="mt-2">{template.label}</CardTitle>
          <CardDescription>{template.shortDescription}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">
            {template.recommendedFor}
          </p>
        </CardContent>
      </Card>
    </button>
  );
}

function ReviewRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
      <dt className="text-sm font-medium text-muted-foreground shrink-0 sm:w-40">
        {label}
      </dt>
      <dd
        className={cn(
          "text-sm break-words",
          muted ? "text-muted-foreground italic" : "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 6L5 8.5L9.5 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="text-primary"
    >
      <path
        d="M8 1L9.5 5.5L14 7L9.5 8.5L8 13L6.5 8.5L2 7L6.5 5.5L8 1Z"
        fill="currentColor"
        opacity="0.7"
      />
      <path
        d="M12.5 1L13.25 3L15 3.75L13.25 4.5L12.5 6.5L11.75 4.5L10 3.75L11.75 3L12.5 1Z"
        fill="currentColor"
        opacity="0.5"
      />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
