import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Blocks,
  Sparkles,
  Code,
  Layout,
  Shield,
  ArrowRight,
  CheckCircle,
  Zap,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ---------- auth gate ---------- */

function isAuthenticated(): boolean {
  const cookieStore = cookies();
  const all = cookieStore.getAll();
  return all.some(
    (c) => c.name.startsWith("sb-") && c.name.includes("auth-token"),
  );
}

/* ---------- data ---------- */

const features = [
  {
    icon: Sparkles,
    title: "AIブループリント生成",
    description:
      "アイデアを入力するだけで、データモデル・API設計・画面構成をAIが自動で設計書に落とし込みます。",
    accent: "from-indigo-500 to-violet-500",
    bg: "bg-indigo-50",
    iconColor: "text-indigo-600",
  },
  {
    icon: Code,
    title: "フルスタックコード生成",
    description:
      "スキーマ定義からAPI、UIコンポーネントまで一気通貫で生成。手書きゼロでプロダクトが立ち上がります。",
    accent: "from-violet-500 to-purple-500",
    bg: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  {
    icon: Layout,
    title: "テンプレートから開始",
    description:
      "SaaS、CRM、会員サイト、アフィリエイトなど豊富なテンプレートを選ぶだけで即座にプロジェクトを開始。",
    accent: "from-purple-500 to-fuchsia-500",
    bg: "bg-purple-50",
    iconColor: "text-purple-600",
  },
  {
    icon: Shield,
    title: "品質ゲート搭載",
    description:
      "生成コードはバリデーション・テスト・型チェックを自動実行。安心してデプロイできる品質を保証します。",
    accent: "from-emerald-500 to-teal-500",
    bg: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
];

const steps = [
  {
    number: "01",
    title: "アイデアを入力",
    description: "作りたいSaaSの概要を日本語で記述するだけ。技術知識は不要です。",
    icon: Sparkles,
  },
  {
    number: "02",
    title: "AIが設計・生成",
    description:
      "ブループリントを自動生成し、スキーマ・API・UIをフルスタックで構築します。",
    icon: Zap,
  },
  {
    number: "03",
    title: "デプロイ",
    description:
      "品質ゲートを通過したコードをワンクリックでデプロイ。すぐにユーザーへ届けられます。",
    icon: CheckCircle,
  },
];

/* ---------- page ---------- */

export default function HomePage() {
  if (isAuthenticated()) {
    redirect("/projects");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ========== NAV ========== */}
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm shadow-primary/20">
              <Blocks className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              SaaS Builder
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/login">ログイン</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/signup">
                無料で始める
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ========== HERO ========== */}
      <section className="relative isolate overflow-hidden">
        {/* decorative grid & glow */}
        <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-40" />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-primary/6 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-6 pb-24 pt-24 text-center sm:pt-32 lg:pt-40">
          {/* pill badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm shadow-xs">
            <span className="flex h-2 w-2 rounded-full bg-success animate-pulse-dot" />
            <span className="text-muted-foreground">
              次世代のSaaS開発プラットフォーム
            </span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="text-gradient">AIでSaaSを、</span>
            <br className="sm:hidden" />
            <span className="text-gradient">誰でも。</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            アイデアを入力するだけで、設計からコード生成、デプロイまで。
            <br className="hidden sm:block" />
            プログラミング不要で、プロ品質のSaaSアプリを構築できます。
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" className="w-full sm:w-auto px-8 text-base shadow-lg shadow-primary/20" asChild>
              <Link href="/auth/signup">
                無料で始める
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto px-8 text-base"
              asChild
            >
              <Link href="#features">機能を見る</Link>
            </Button>
          </div>

          {/* trust line */}
          <p className="mt-8 text-xs text-muted-foreground/60">
            クレジットカード不要 &middot; 無料プランで今すぐスタート
          </p>
        </div>
      </section>

      {/* ========== FEATURES ========== */}
      <section
        id="features"
        className="relative border-t bg-muted/30 py-24 sm:py-32"
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Features
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              開発の常識を変える4つの機能
            </h2>
            <p className="mt-4 text-muted-foreground">
              アイデアからデプロイまで、すべてをAIがサポートします。
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:gap-8">
            {features.map((f) => (
              <div
                key={f.title}
                className="group relative rounded-2xl border bg-card p-8 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5"
              >
                {/* gradient top-line accent */}
                <div
                  className={`absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r ${f.accent} opacity-0 transition-opacity group-hover:opacity-100`}
                />

                <div
                  className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl ${f.bg}`}
                >
                  <f.icon className={`h-6 w-6 ${f.iconColor}`} />
                </div>

                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="border-t py-24 sm:py-32">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              3ステップで完成
            </h2>
            <p className="mt-4 text-muted-foreground">
              複雑なセットアップは不要。シンプルな流れでSaaSが完成します。
            </p>
          </div>

          <div className="relative mt-16 grid gap-12 sm:grid-cols-3 sm:gap-8">
            {/* connector line (desktop) */}
            <div className="pointer-events-none absolute left-0 right-0 top-10 hidden h-0.5 bg-gradient-to-r from-transparent via-border to-transparent sm:block" />

            {steps.map((s) => (
              <div key={s.number} className="relative text-center">
                <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
                  {/* outer ring */}
                  <div className="absolute inset-0 rounded-2xl border-2 border-primary/10" />
                  {/* inner circle */}
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/5">
                    <s.icon className="h-7 w-7 text-primary" />
                  </div>
                  {/* number badge */}
                  <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm">
                    {s.number}
                  </span>
                </div>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== SOCIAL PROOF (stats) ========== */}
      <section className="border-t bg-muted/30 py-16">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 px-6 sm:grid-cols-4">
          {[
            { value: "500+", label: "テンプレート" },
            { value: "10x", label: "開発速度" },
            { value: "99.9%", label: "稼働率" },
            { value: "0円", label: "初期費用" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold tracking-tight text-gradient">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ========== FINAL CTA ========== */}
      <section className="relative isolate overflow-hidden border-t py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-30" />
        <div className="pointer-events-none absolute -bottom-40 left-1/2 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-primary/6 blur-3xl" />

        <div className="relative mx-auto max-w-2xl px-6 text-center">
          <Database className="mx-auto mb-6 h-10 w-10 text-primary/40" />
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            今すぐ無料で始めましょう
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            アイデアを形にする第一歩を、今日ここから。
            <br />
            クレジットカード不要で、すべての機能をお試しいただけます。
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="w-full sm:w-auto px-10 text-base shadow-lg shadow-primary/20"
              asChild
            >
              <Link href="/auth/signup">
                無料アカウントを作成
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="w-full sm:w-auto px-8 text-base" asChild>
              <Link href="/auth/login">ログインはこちら</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ========== FOOTER ========== */}
      <footer className="border-t py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Blocks className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-sm font-medium">SaaS Builder</span>
          </div>

          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} SaaS Builder. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
