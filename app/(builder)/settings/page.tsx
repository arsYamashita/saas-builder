"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Key, Settings2 } from "lucide-react";

interface ProviderStatus {
  name: string;
  envKey: string;
  isSet: boolean;
}

export default function SettingsPage() {
  const [providers] = useState<ProviderStatus[]>([
    {
      name: "Claude (Anthropic)",
      envKey: "CLAUDE_API_KEY",
      isSet: !!process.env.NEXT_PUBLIC_CLAUDE_CONFIGURED,
    },
    {
      name: "Gemini (Google)",
      envKey: "GEMINI_API_KEY",
      isSet: !!process.env.NEXT_PUBLIC_GEMINI_CONFIGURED,
    },
    {
      name: "Stripe",
      envKey: "STRIPE_SECRET_KEY",
      isSet: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    },
    {
      name: "Supabase",
      envKey: "SUPABASE_SERVICE_ROLE_KEY",
      isSet: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    },
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your SaaS Builder configuration.
        </p>
      </div>

      {/* Service Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" />
            Service Configuration
          </CardTitle>
          <CardDescription>
            API keys are configured via environment variables on the server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {providers.map((provider) => (
              <div
                key={provider.envKey}
                className="flex items-center justify-between rounded-md border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{provider.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {provider.envKey}
                  </p>
                </div>
                {provider.isSet ? (
                  <Badge variant="success">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Not Set
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* App Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4" />
            Application Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono">0.1.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Framework</span>
              <span>Next.js 14</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Database</span>
              <span>Supabase (PostgreSQL)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">AI Providers</span>
              <span>Claude, Gemini</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
