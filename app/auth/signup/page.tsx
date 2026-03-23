"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Blocks,
  Mail,
  Lock,
  User,
  Building2,
  Loader2,
  AlertCircle,
} from "lucide-react";

export default function SignupPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: "",
    tenantName: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "アカウント作成に失敗しました");
        return;
      }

      router.push(json.redirectTo || "/projects");
      router.refresh();
    } catch {
      setError("予期しないエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-grid-pattern p-4">
      <div className="w-full max-w-md animate-scale-in">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
            <Blocks className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">SaaS Builder</h1>
          <p className="text-sm text-muted-foreground">
            アカウントを作成して始めましょう
          </p>
        </div>

        <Card className="shadow-elevated">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">アカウント作成</CardTitle>
            <CardDescription>
              アカウントと組織を設定します。
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="displayName"
                  className="text-sm font-medium leading-none"
                >
                  表示名
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="displayName"
                    placeholder="お名前"
                    className="pl-10"
                    value={form.displayName}
                    onChange={(e) =>
                      setForm({ ...form, displayName: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="tenantName"
                  className="text-sm font-medium leading-none"
                >
                  組織名
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="tenantName"
                    placeholder="会社名・チーム名"
                    className="pl-10"
                    value={form.tenantName}
                    onChange={(e) =>
                      setForm({ ...form, tenantName: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium leading-none"
                >
                  メールアドレス
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@example.com"
                    className="pl-10"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium leading-none"
                >
                  パスワード
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="パスワードを作成"
                    className="pl-10"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    作成中...
                  </>
                ) : (
                  "アカウント作成"
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                すでにアカウントをお持ちの方は{" "}
                <Link
                  href="/auth/login"
                  className="font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  サインイン
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          Powered by SaaS Builder
        </p>
      </div>
    </div>
  );
}
