"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import {
  Loader2,
  Check,
  X,
  Database,
  Monitor,
  Users,
  CreditCard,
  FileText,
  Sparkles,
  ArrowLeft,
  Info,
} from "lucide-react";
import Link from "next/link";

interface BlueprintViewerProps {
  projectId: string;
  blueprint: any | null;
  projectName: string;
}

type TabKey = "entities" | "screens" | "roles" | "billing" | "raw";

const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "entities", label: "データ構造", icon: Database },
  { key: "screens", label: "画面一覧", icon: Monitor },
  { key: "roles", label: "ユーザー権限", icon: Users },
  { key: "billing", label: "課金設定", icon: CreditCard },
  { key: "raw", label: "JSON詳細", icon: FileText },
];

const sectionGuides: Record<TabKey, string> = {
  entities:
    "「データ構造」は、アプリで管理する情報の種類です。例えば「ユーザー」「予約」「商品」など。各項目の名前とデータ型が正しいか確認してください。",
  screens:
    "「画面一覧」は、アプリにどんなページがあるかの一覧です。ログイン画面、一覧画面、設定画面など、必要な画面が揃っているか確認してください。",
  roles:
    "「ユーザー権限」は、誰がどの機能を使えるかの設定です。管理者・一般ユーザーなど、役割ごとにできることが正しいか確認してください。",
  billing:
    "「課金設定」は、料金プランや支払い方法の設定です。無料プラン・有料プランの内容と価格が正しいか確認してください。",
  raw:
    "設計書の生データ（JSON形式）です。技術者向けの詳細情報が含まれています。通常は確認不要です。",
};

export function BlueprintViewer({
  projectId,
  blueprint,
  projectName,
}: BlueprintViewerProps) {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<
    "approve" | "reject" | null
  >(null);
  const [currentBlueprint, setCurrentBlueprint] = useState(blueprint);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("entities");

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/generate-blueprint`,
        { method: "POST" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to generate blueprint");
      }
      const data = await res.json();
      setCurrentBlueprint(data.blueprint ?? data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (action: "approve" | "reject") => {
    setActionLoading(action);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/approve-blueprint`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to ${action} blueprint`);
      }
      const data = await res.json();
      setCurrentBlueprint(data.blueprint ?? data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (!currentBlueprint) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="プロジェクトに戻る">
            <Link href={`/projects/${projectId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">設計書（ブループリント）</h1>
            <p className="text-sm text-muted-foreground">{projectName}</p>
          </div>
        </div>

        <Card>
          <EmptyState
            icon={Sparkles}
            title="設計書がまだ作成されていません"
            description="AIがあなたのプロジェクトに最適なデータ構造、画面、ユーザー権限、課金モデルを自動設計します。"
            action={
              <Button onClick={handleGenerate} disabled={loading} size="lg">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    設計書を生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    AIで設計書を生成
                  </>
                )}
              </Button>
            }
          />
          {error && (
            <div className="px-6 pb-6">
              <p className="text-sm text-destructive text-center">{error}</p>
            </div>
          )}
        </Card>
      </div>
    );
  }

  const entities =
    currentBlueprint.prd_json?.entities ??
    currentBlueprint.entities_json ??
    [];
  const screens = currentBlueprint.screens_json ?? [];
  const roles = currentBlueprint.roles_json ?? [];
  const billing = currentBlueprint.billing_json ?? null;
  const version = currentBlueprint.version ?? 1;
  const status = currentBlueprint.status ?? "draft";

  const statusVariant =
    status === "approved"
      ? "success"
      : status === "rejected"
        ? "destructive"
        : "secondary";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="プロジェクトに戻る">
            <Link href={`/projects/${projectId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">設計書（ブループリント）</h1>
              <Badge variant={statusVariant}>
                {status === "approved" ? "承認済み" : status === "rejected" ? "却下" : "確認待ち"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {projectName} &middot; バージョン {version}
            </p>
          </div>
        </div>

        {status !== "approved" && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => handleApproval("reject")}
              disabled={actionLoading !== null}
              className="text-destructive hover:text-destructive"
            >
              {actionLoading === "reject" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              やり直す
            </Button>
            <Button
              variant="success"
              onClick={() => handleApproval("approve")}
              disabled={actionLoading !== null}
            >
              {actionLoading === "approve" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              この設計で進める
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Guidance for non-technical users */}
      {status !== "approved" && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="h-5 w-5 shrink-0 text-blue-600 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900">
                設計書の確認方法
              </p>
              <p className="text-sm text-blue-700">
                AIがあなたのプロジェクトに必要な機能を自動設計しました。各タブを確認して、
                内容に問題がなければ「この設計で進める」を押してください。
                修正が必要な場合は「やり直す」で再生成できます。
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="border-b">
        <div role="tablist" className="flex gap-1" aria-label="設計書セクション">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                aria-controls={`tabpanel-${tab.key}`}
                id={`tab-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="animate-fade-in"
      >
        {/* Section guide */}
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-muted/50 px-4 py-3">
          <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
          <p className="text-sm text-muted-foreground">
            {sectionGuides[activeTab]}
          </p>
        </div>
        {activeTab === "entities" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entities.length > 0 ? (
              entities.map((entity: any, i: number) => (
                <Card key={entity.name ?? i} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                        <Database className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {entity.name ?? entity}
                        </p>
                        {entity.fields && (
                          <p className="text-xs text-muted-foreground">
                            {Array.isArray(entity.fields)
                              ? entity.fields.length
                              : 0}
                            項目
                          </p>
                        )}
                      </div>
                    </div>
                    {entity.fields && Array.isArray(entity.fields) && (
                      <div className="mt-3 space-y-1">
                        {entity.fields.slice(0, 5).map((f: any, fi: number) => (
                          <div
                            key={fi}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="font-mono text-muted-foreground">
                              {f.name ?? f}
                            </span>
                            {f.type && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {f.type}
                              </Badge>
                            )}
                          </div>
                        ))}
                        {entity.fields.length > 5 && (
                          <p className="text-xs text-muted-foreground">
                            他 {entity.fields.length - 5} 件
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-full">
                <EmptyState
                  icon={Database}
                  title="データ構造が未定義です"
                  description="設計書を生成すると、アプリで扱うデータの種類がここに表示されます。"
                />
              </div>
            )}
          </div>
        )}

        {activeTab === "screens" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {screens.length > 0 ? (
              screens.map((screen: any, i: number) => (
                <Card key={screen.name ?? i}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
                        <Monitor className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {screen.name ?? screen}
                        </p>
                        {screen.path && (
                          <p className="text-xs text-muted-foreground font-mono">
                            {screen.path}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="col-span-full">
                <EmptyState
                  icon={Monitor}
                  title="画面が未定義です"
                  description="設計書を生成すると、アプリの画面一覧がここに表示されます。"
                />
              </div>
            )}
          </div>
        )}

        {activeTab === "roles" && (
          <Card>
            <CardContent className="p-6">
              {roles.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {roles.map((role: any, i: number) => (
                    <div
                      key={role.name ?? i}
                      className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50">
                        <Users className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {role.name ?? role}
                        </p>
                        {role.permissions && (
                          <p className="text-xs text-muted-foreground">
                            {Array.isArray(role.permissions)
                              ? role.permissions.length
                              : 0}
                            権限
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Users}
                  title="ユーザー権限が未定義です"
                  description="設計書を生成すると、利用者の種類と権限がここに表示されます。"
                />
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "billing" && (
          <Card>
            <CardContent className="p-6">
              {billing ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {billing.model && (
                    <div className="rounded-lg border p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        課金モデル
                      </p>
                      <p className="mt-1 text-lg font-semibold">{billing.model}</p>
                    </div>
                  )}
                  {billing.currency && (
                    <div className="rounded-lg border p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        通貨
                      </p>
                      <p className="mt-1 text-lg font-semibold uppercase">
                        {billing.currency}
                      </p>
                    </div>
                  )}
                  {billing.plans && (
                    <div className="rounded-lg border p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        プラン数
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {Array.isArray(billing.plans) ? billing.plans.length : 0}
                      </p>
                    </div>
                  )}
                  {billing.trial_days != null && (
                    <div className="rounded-lg border p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        無料お試し期間
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {billing.trial_days} 日間
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={CreditCard}
                  title="課金設定が未定義です"
                  description="設計書を生成すると、料金プランや課金モデルがここに表示されます。"
                />
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "raw" && (
          <Card>
            <CardContent className="p-0">
              <pre className="max-h-[600px] overflow-auto rounded-xl bg-slate-950 p-6 text-xs leading-relaxed text-slate-300">
                <code>{JSON.stringify(currentBlueprint, null, 2)}</code>
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
