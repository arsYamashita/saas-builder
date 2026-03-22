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
import {
  Loader2,
  Check,
  X,
  Database,
  Monitor,
  Users,
  CreditCard,
} from "lucide-react";

interface BlueprintViewerProps {
  projectId: string;
  blueprint: any | null;
  projectName: string;
}

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
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{projectName} - Blueprint</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <p className="text-muted-foreground text-center">
              No blueprint has been generated yet. Generate one to define the
              entities, screens, roles, and billing model for your project.
            </p>
            <Button onClick={handleGenerate} disabled={loading} size="lg">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Blueprint"
              )}
            </Button>
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
          </CardContent>
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
      ? "default"
      : status === "rejected"
        ? "destructive"
        : "secondary";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{projectName} - Blueprint</h1>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant}>{status}</Badge>
            <span className="text-sm text-muted-foreground">
              Version {version}
            </span>
          </div>
        </div>

        {status !== "approved" && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => handleApproval("reject")}
              disabled={actionLoading !== null}
            >
              {actionLoading === "reject" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Reject
            </Button>
            <Button
              onClick={() => handleApproval("approve")}
              disabled={actionLoading !== null}
            >
              {actionLoading === "approve" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Approve
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Entities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Entities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entities.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {entities.map((entity: any, i: number) => (
                  <div
                    key={entity.name ?? i}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    {entity.name ?? entity}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No entities defined.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Screens */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Screens
            </CardTitle>
          </CardHeader>
          <CardContent>
            {screens.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {screens.map((screen: any, i: number) => (
                  <div
                    key={screen.name ?? i}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    {screen.name ?? screen}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No screens defined.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Roles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Roles
            </CardTitle>
          </CardHeader>
          <CardContent>
            {roles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {roles.map((role: any, i: number) => (
                  <Badge key={role.name ?? i} variant="secondary">
                    {role.name ?? role}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No roles defined.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Billing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Billing
            </CardTitle>
          </CardHeader>
          <CardContent>
            {billing ? (
              <div className="space-y-2 text-sm">
                {billing.model && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Model</span>
                    <span className="font-medium">{billing.model}</span>
                  </div>
                )}
                {billing.currency && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Currency</span>
                    <span className="font-medium">{billing.currency}</span>
                  </div>
                )}
                {billing.plans && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Plans</span>
                    <span className="font-medium">
                      {Array.isArray(billing.plans)
                        ? billing.plans.length
                        : 0}
                    </span>
                  </div>
                )}
                {billing.trial_days != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trial</span>
                    <span className="font-medium">
                      {billing.trial_days} days
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No billing configuration.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
