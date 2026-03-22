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
} from "lucide-react";
import Link from "next/link";

interface BlueprintViewerProps {
  projectId: string;
  blueprint: any | null;
  projectName: string;
}

type TabKey = "entities" | "screens" | "roles" | "billing" | "raw";

const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "entities", label: "Entities", icon: Database },
  { key: "screens", label: "Screens", icon: Monitor },
  { key: "roles", label: "Roles", icon: Users },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "raw", label: "Raw JSON", icon: FileText },
];

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
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/projects/${projectId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Blueprint</h1>
            <p className="text-sm text-muted-foreground">{projectName}</p>
          </div>
        </div>

        <Card>
          <EmptyState
            icon={Sparkles}
            title="No blueprint generated"
            description="Generate a blueprint to define the entities, screens, roles, and billing model for your project."
            action={
              <Button onClick={handleGenerate} disabled={loading} size="lg">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Blueprint
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
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/projects/${projectId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Blueprint</h1>
              <Badge variant={statusVariant} className="capitalize">
                {status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {projectName} &middot; Version {version}
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
              Reject
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
              Approve
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-1" aria-label="Blueprint sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
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
        </nav>
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in">
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
                              : 0}{" "}
                            fields
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
                            +{entity.fields.length - 5} more
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
                  title="No entities defined"
                  description="Entities will appear here after blueprint generation."
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
                  title="No screens defined"
                  description="Screens will appear here after blueprint generation."
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
                              : 0}{" "}
                            permissions
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Users}
                  title="No roles defined"
                  description="Roles will appear here after blueprint generation."
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
                        Model
                      </p>
                      <p className="mt-1 text-lg font-semibold">{billing.model}</p>
                    </div>
                  )}
                  {billing.currency && (
                    <div className="rounded-lg border p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Currency
                      </p>
                      <p className="mt-1 text-lg font-semibold uppercase">
                        {billing.currency}
                      </p>
                    </div>
                  )}
                  {billing.plans && (
                    <div className="rounded-lg border p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Plans
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {Array.isArray(billing.plans) ? billing.plans.length : 0}
                      </p>
                    </div>
                  )}
                  {billing.trial_days != null && (
                    <div className="rounded-lg border p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Trial Period
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {billing.trial_days} days
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={CreditCard}
                  title="No billing configuration"
                  description="Billing configuration will appear here after blueprint generation."
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
