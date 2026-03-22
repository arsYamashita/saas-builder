"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusDot } from "@/components/ui/status-dot";
import { Separator } from "@/components/ui/separator";
import { Key, Settings2, Globe, Cpu } from "lucide-react";

interface ProviderStatus {
  name: string;
  envKey: string;
  isSet: boolean;
  icon: React.ElementType;
}

export default function SettingsPage() {
  const [providers] = useState<ProviderStatus[]>([
    {
      name: "Claude (Anthropic)",
      envKey: "CLAUDE_API_KEY",
      isSet: !!process.env.NEXT_PUBLIC_CLAUDE_CONFIGURED,
      icon: Cpu,
    },
    {
      name: "Gemini (Google)",
      envKey: "GEMINI_API_KEY",
      isSet: !!process.env.NEXT_PUBLIC_GEMINI_CONFIGURED,
      icon: Cpu,
    },
    {
      name: "Stripe",
      envKey: "STRIPE_SECRET_KEY",
      isSet: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      icon: Key,
    },
    {
      name: "Supabase",
      envKey: "SUPABASE_SERVICE_ROLE_KEY",
      isSet: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      icon: Globe,
    },
  ]);

  const connectedCount = providers.filter((p) => p.isSet).length;

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="設定"
        description="SaaS Builderの設定とサービス接続を管理します。"
      />

      {/* Service Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Key className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>サービス設定</CardTitle>
              <CardDescription>
                APIキーはサーバーの環境変数で設定されています。
                {" "}{connectedCount}/{providers.length} 件のサービスが接続済み
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {providers.map((provider) => {
              const Icon = provider.icon;
              return (
                <div
                  key={provider.envKey}
                  className="flex items-center justify-between rounded-xl border px-4 py-3.5 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{provider.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {provider.envKey}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusDot
                      status={provider.isSet ? "online" : "offline"}
                    />
                    {provider.isSet ? (
                      <Badge variant="success">接続済み</Badge>
                    ) : (
                      <Badge variant="warning">未設定</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* App Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>アプリケーション情報</CardTitle>
              <CardDescription>
                SaaS Builderインスタンスの技術情報
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {[
              { label: "バージョン", value: "0.1.0" },
              { label: "フレームワーク", value: "Next.js 14 (App Router)" },
              { label: "データベース", value: "Supabase (PostgreSQL)" },
              { label: "AIプロバイダー", value: "Claude, Gemini" },
              { label: "スタイリング", value: "Tailwind CSS" },
            ].map((item, index) => (
              <div key={item.label}>
                {index > 0 && <Separator className="my-0" />}
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm text-muted-foreground">
                    {item.label}
                  </span>
                  <span className="text-sm font-medium">{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
