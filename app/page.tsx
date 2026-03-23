import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Blocks,
  Sparkles,
  Code,
  Shield,
  ArrowRight,
  Check,
  Lightbulb,
  Cpu,
  Download,
  Users,
  CalendarCheck,
  Contact,
  FileText,
  Building2,
  ChevronRight,
  ExternalLink,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/ui/scroll-reveal";

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
    title: "AIブループリント",
    description:
      "アイデアを話すだけで、データ設計・画面設計・権限設計を自動生成。",
    gradient: "from-blue-500 to-indigo-600",
    bgLight: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  {
    icon: Code,
    title: "フルスタック生成",
    description:
      "Next.js + Supabase + Stripeの本格コードを一気通貫で生成。",
    gradient: "from-violet-500 to-purple-600",
    bgLight: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  {
    icon: Shield,
    title: "品質保証",
    description:
      "自動テスト・型チェック・品質スコアで本番レベルを担保。",
    gradient: "from-emerald-500 to-teal-600",
    bgLight: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
];

const steps = [
  {
    number: "01",
    title: "アイデアを入力",
    description: "テンプレートを選んで、サービスの概要を入力するだけ。",
    icon: Lightbulb,
  },
  {
    number: "02",
    title: "AIが自動生成",
    description: "Geminiが設計し、Claudeがコードを生成。",
    icon: Cpu,
  },
  {
    number: "03",
    title: "エクスポート",
    description: "生成されたNext.jsアプリをダウンロード。",
    icon: Download,
  },
];

const templates = [
  {
    icon: Users,
    name: "会員制サイト",
    tag: "Community",
    description: "会員登録・課金・コンテンツ配信を備えたメンバーシップサイト",
  },
  {
    icon: CalendarCheck,
    name: "予約管理システム",
    tag: "Reservation",
    description: "カレンダー連携・リマインド・決済付きの予約管理",
  },
  {
    icon: Contact,
    name: "顧客管理CRM",
    tag: "CRM",
    description: "顧客情報・商談管理・分析ダッシュボード",
  },
  {
    icon: FileText,
    name: "コンテンツ管理",
    tag: "CMS",
    description: "記事投稿・メディア管理・SEO最適化されたCMS",
  },
  {
    icon: Building2,
    name: "社内業務システム",
    tag: "Internal",
    description: "ワークフロー・承認機能・レポート機能付き業務アプリ",
  },
];

const comparison = [
  {
    label: "コスト",
    saas: "無料〜",
    nocode: "月額3万〜",
    outsource: "50万〜",
  },
  {
    label: "期間",
    saas: "5分",
    nocode: "数週間",
    outsource: "数ヶ月",
  },
  {
    label: "コード所有",
    saas: true,
    nocode: false,
    outsource: true,
  },
  {
    label: "カスタマイズ",
    saas: true,
    nocode: "partial",
    outsource: true,
  },
];

const techStack = ["Next.js", "Supabase", "Stripe", "Vercel", "TypeScript"];

/* ---------- page ---------- */

export default function HomePage() {
  if (isAuthenticated()) {
    redirect("/projects");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================
          STICKY HEADER
      ================================================================ */}
      <nav aria-label="メインナビゲーション" className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-sm shadow-primary/20">
              <Blocks className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              SaaS Builder
            </span>
          </Link>

          {/* Nav Links (hidden on mobile) */}
          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              機能
            </a>
            <a
              href="#how-it-works"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              使い方
            </a>
            <a
              href="#templates"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              テンプレート
            </a>
          </div>

          {/* Auth Buttons */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
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

      <main id="main-content">
      {/* ================================================================
          HERO SECTION
      ================================================================ */}
      <section className="relative isolate overflow-hidden">
        {/* Background decorations */}
        <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-30" />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[700px] w-[1000px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute top-20 -left-40 h-[400px] w-[400px] rounded-full bg-violet-500/5 blur-3xl" />
        <div className="pointer-events-none absolute top-40 -right-40 h-[400px] w-[400px] rounded-full bg-blue-500/5 blur-3xl" />

        <div className="relative mx-auto max-w-5xl px-6 pb-20 pt-20 sm:pt-28 lg:pt-36">
          {/* Pill badge */}
          <div
            className="mx-auto mb-8 flex w-fit items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm shadow-xs"
            style={{ animation: "fade-in 0.6s ease-out" }}
          >
            <span className="flex h-2 w-2 rounded-full bg-success animate-pulse-dot" />
            <span className="text-muted-foreground">
              次世代のSaaS開発プラットフォーム
            </span>
          </div>

          {/* Main Headline */}
          <h1
            className="text-center text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl"
            style={{ animation: "fade-in-up 0.7s ease-out" }}
          >
            <span className="hero-gradient-text">AIでSaaSを、誰でも。</span>
          </h1>

          {/* Subheadline */}
          <p
            className="mx-auto mt-6 max-w-2xl text-center text-lg leading-relaxed text-muted-foreground sm:text-xl"
            style={{ animation: "fade-in-up 0.7s ease-out 0.15s both" }}
          >
            アイデアを入力するだけ。AIが設計からコードまで自動生成。
          </p>

          {/* CTA Buttons */}
          <div
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
            style={{ animation: "fade-in-up 0.7s ease-out 0.3s both" }}
          >
            <Button
              size="lg"
              className="w-full sm:w-auto px-10 text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-shadow"
              asChild
            >
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
              <Link href="#how-it-works">
                デモを見る
                <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {/* Trust indicators */}
          <p
            className="mt-8 text-center text-sm text-muted-foreground"
            style={{ animation: "fade-in-up 0.7s ease-out 0.45s both" }}
          >
            クレジットカード不要 &middot; 5分で最初のSaaS &middot; コード100%所有
          </p>

          {/* 3-Step Visual Flow Mockup */}
          <div
            className="mt-16 animate-float"
            style={{ animation: "fade-in-up 0.8s ease-out 0.6s both" }}
          >
            <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-primary/5">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-red-400/70" />
                <div className="h-3 w-3 rounded-full bg-yellow-400/70" />
                <div className="h-3 w-3 rounded-full bg-green-400/70" />
                <div className="ml-3 flex-1 rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground">
                  saas-builder.app
                </div>
              </div>
              {/* Mockup content: 3-step flow */}
              <div className="flex flex-col items-center gap-6 p-8 sm:flex-row sm:justify-center sm:gap-4">
                {/* Step 1 */}
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50">
                    <Lightbulb className="h-7 w-7 text-blue-600" />
                  </div>
                  <span className="text-sm font-medium">アイデア入力</span>
                  <div className="mt-1 h-8 w-32 rounded-lg bg-muted/60" />
                  <div className="h-4 w-24 rounded bg-muted/40" />
                </div>

                {/* Arrow */}
                <ChevronRight className="hidden h-6 w-6 shrink-0 text-muted-foreground/40 sm:block" />
                <div className="h-6 w-px bg-border sm:hidden" />

                {/* Step 2 */}
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-violet-50">
                    <Cpu className="h-7 w-7 text-violet-600" />
                  </div>
                  <span className="text-sm font-medium">AI生成中...</span>
                  <div className="mt-1 flex gap-1">
                    <div className="h-8 w-20 rounded-lg bg-gradient-to-r from-violet-100 to-purple-100" />
                    <div className="h-8 w-12 rounded-lg bg-gradient-to-r from-blue-100 to-indigo-100" />
                  </div>
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full w-2/3 rounded-full bg-gradient-to-r from-violet-500 to-purple-500"
                      style={{ animation: "shimmer 2s ease-in-out infinite" }}
                    />
                  </div>
                </div>

                {/* Arrow */}
                <ChevronRight className="hidden h-6 w-6 shrink-0 text-muted-foreground/40 sm:block" />
                <div className="h-6 w-px bg-border sm:hidden" />

                {/* Step 3 */}
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50">
                    <Download className="h-7 w-7 text-emerald-600" />
                  </div>
                  <span className="text-sm font-medium">完成!</span>
                  <div className="mt-1 h-8 w-32 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span className="ml-1 text-xs font-medium text-emerald-700">Ready</span>
                  </div>
                  <div className="h-4 w-20 rounded bg-muted/40" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          SOCIAL PROOF BAR
      ================================================================ */}
      <section className="border-t border-b bg-muted/20 py-8">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            {/* Stats */}
            <div className="flex items-center gap-8">
              <div className="text-center">
                <p className="text-2xl font-bold tracking-tight text-gradient">
                  500+
                </p>
                <p className="text-xs text-muted-foreground">
                  プロジェクト作成済み
                </p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <p className="text-2xl font-bold tracking-tight text-gradient">
                  10x
                </p>
                <p className="text-xs text-muted-foreground">
                  開発速度
                </p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <p className="text-2xl font-bold tracking-tight text-gradient">
                  0円
                </p>
                <p className="text-xs text-muted-foreground">
                  初期費用
                </p>
              </div>
            </div>

            {/* Tech badges */}
            <div className="flex flex-wrap items-center gap-2">
              {techStack.map((tech) => (
                <span
                  key={tech}
                  className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          FEATURES SECTION
      ================================================================ */}
      <section id="features" className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-primary" lang="en">
                Features
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                すべてが、自動で。
              </h2>
              <p className="mt-4 text-muted-foreground">
                アイデアからデプロイまで、AIが全工程をサポートします。
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal stagger className="mt-16 grid gap-6 sm:grid-cols-3 lg:gap-8">
            {features.map((f) => (
              <div
                key={f.title}
                className="group relative overflow-hidden rounded-2xl border bg-card p-8 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
              >
                {/* Gradient accent bar at top */}
                <div
                  className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${f.gradient} opacity-60 transition-opacity group-hover:opacity-100`}
                />

                {/* Hover glow effect */}
                <div
                  className={`pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r ${f.gradient} opacity-0 blur-xl transition-opacity group-hover:opacity-5`}
                />

                <div
                  className={`relative mb-5 inline-flex h-14 w-14 items-center justify-center rounded-xl ${f.bgLight} transition-transform duration-300 group-hover:scale-110`}
                >
                  <f.icon className={`h-7 w-7 ${f.iconColor}`} />
                </div>

                <h3 className="relative text-lg font-semibold">{f.title}</h3>
                <p className="relative mt-2 leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </ScrollReveal>
        </div>
      </section>

      {/* ================================================================
          HOW IT WORKS
      ================================================================ */}
      <section
        id="how-it-works"
        className="relative border-t bg-muted/30 py-24 sm:py-32"
      >
        {/* Subtle background pattern */}
        <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-20" />

        <div className="relative mx-auto max-w-5xl px-6">
          <ScrollReveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-primary" lang="en">
                How it works
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                3ステップで、SaaSが完成。
              </h2>
              <p className="mt-4 text-muted-foreground">
                複雑なセットアップは一切不要。驚くほどシンプルです。
              </p>
            </div>
          </ScrollReveal>

          <div className="relative mt-20 grid gap-12 sm:grid-cols-3 sm:gap-8">
            {/* Connector line (desktop only) */}
            <div className="pointer-events-none absolute left-[16.66%] right-[16.66%] top-12 hidden h-px sm:block">
              <div className="h-full w-full bg-gradient-to-r from-blue-300 via-violet-300 to-emerald-300 opacity-40" />
            </div>

            {steps.map((s, i) => (
              <ScrollReveal key={s.number} delay={i * 150}>
                <div className="relative text-center">
                  {/* Step circle */}
                  <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center">
                    {/* Outer ring with gradient */}
                    <div
                      className={`absolute inset-0 rounded-2xl border-2 ${
                        i === 0
                          ? "border-blue-200"
                          : i === 1
                          ? "border-violet-200"
                          : "border-emerald-200"
                      }`}
                    />
                    {/* Inner icon area */}
                    <div
                      className={`flex h-16 w-16 items-center justify-center rounded-xl ${
                        i === 0
                          ? "bg-blue-50"
                          : i === 1
                          ? "bg-violet-50"
                          : "bg-emerald-50"
                      }`}
                    >
                      <s.icon
                        className={`h-8 w-8 ${
                          i === 0
                            ? "text-blue-600"
                            : i === 1
                            ? "text-violet-600"
                            : "text-emerald-600"
                        }`}
                      />
                    </div>
                    {/* Number badge */}
                    <span
                      className={`absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-md ${
                        i === 0
                          ? "bg-blue-600"
                          : i === 1
                          ? "bg-violet-600"
                          : "bg-emerald-600"
                      }`}
                    >
                      {s.number}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {s.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          TEMPLATES SECTION
      ================================================================ */}
      <section id="templates" className="py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-primary" lang="en">
                Templates
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                豊富なテンプレート
              </h2>
              <p className="mt-4 text-muted-foreground">
                ユースケースに合わせて最適なテンプレートを選ぶだけ。すぐに開発をスタートできます。
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal stagger className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <div
                key={t.name}
                className="group relative flex items-start gap-4 rounded-xl border bg-card p-6 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/5 transition-colors group-hover:bg-primary/10">
                  <t.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{t.name}</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {t.tag}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {t.description}
                  </p>
                </div>
              </div>
            ))}

            {/* "More coming" card */}
            <div className="flex items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center">
              <div>
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                  <Sparkles className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  さらに追加予定...
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ================================================================
          COMPARISON SECTION
      ================================================================ */}
      <section className="border-t bg-muted/30 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl px-6">
          <ScrollReveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-widest text-primary" lang="en">
                Comparison
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                なぜSaaS Builderなのか?
              </h2>
              <p className="mt-4 text-muted-foreground">
                従来の開発手法と比較して、圧倒的なスピードとコストメリット。
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="mt-12 overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">SaaS Builder、ノーコード、外注開発の比較表</caption>
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th scope="col" className="px-6 py-4 text-left font-medium text-muted-foreground"><span className="sr-only">比較項目</span></th>
                      <th className="px-6 py-4 text-center">
                        <div className="inline-flex flex-col items-center gap-1">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                            <Blocks className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-semibold text-foreground">
                            SaaS Builder
                          </span>
                        </div>
                      </th>
                      <th className="px-6 py-4 text-center font-medium text-muted-foreground">
                        ノーコード
                      </th>
                      <th className="px-6 py-4 text-center font-medium text-muted-foreground">
                        外注開発
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((row, i) => (
                      <tr
                        key={row.label}
                        className={`border-b last:border-0 ${
                          i % 2 === 0 ? "" : "bg-muted/20"
                        }`}
                      >
                        <td className="px-6 py-4 font-medium">{row.label}</td>
                        <td className="px-6 py-4 text-center comparison-highlight">
                          {typeof row.saas === "boolean" ? (
                            <span className="inline-flex items-center justify-center">
                              <Check className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                              <span className="sr-only">対応</span>
                            </span>
                          ) : (
                            <span className="font-semibold text-primary">
                              {row.saas}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center text-muted-foreground">
                          {typeof row.nocode === "boolean" ? (
                            row.nocode ? (
                              <span><Check className="mx-auto h-5 w-5 text-emerald-600" aria-hidden="true" /><span className="sr-only">対応</span></span>
                            ) : (
                              <span><span className="text-red-400" aria-hidden="true">&times;</span><span className="sr-only">非対応</span></span>
                            )
                          ) : row.nocode === "partial" ? (
                            <span><span className="text-yellow-500" aria-hidden="true">&triangle;</span><span className="sr-only">一部対応</span></span>
                          ) : (
                            row.nocode
                          )}
                        </td>
                        <td className="px-6 py-4 text-center text-muted-foreground">
                          {typeof row.outsource === "boolean" ? (
                            <span><Check className="mx-auto h-5 w-5 text-emerald-600" aria-hidden="true" /><span className="sr-only">対応</span></span>
                          ) : (
                            row.outsource
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ================================================================
          FINAL CTA
      ================================================================ */}
      <section className="relative isolate overflow-hidden py-24 sm:py-32">
        {/* Decorative background */}
        <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-25" />
        <div className="pointer-events-none absolute -bottom-40 left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute top-20 left-10 h-[300px] w-[300px] rounded-full bg-violet-500/5 blur-3xl" />

        <ScrollReveal>
          <div className="relative mx-auto max-w-2xl px-6 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Blocks className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              今すぐ、あなたの
              <br />
              <span className="text-gradient">SaaSを作りましょう。</span>
            </h2>
            <p className="mt-6 text-lg text-muted-foreground">
              アイデアを形にする第一歩を、今日ここから。
            </p>

            <div className="mt-10">
              <Button
                size="lg"
                className="px-12 text-base shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-shadow"
                asChild
              >
                <Link href="/auth/signup">
                  無料で始める
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              アカウント作成は30秒で完了
            </p>
          </div>
        </ScrollReveal>
      </section>

      </main>

      {/* ================================================================
          FOOTER
      ================================================================ */}
      <footer className="border-t bg-muted/20 py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            {/* Logo & description */}
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Blocks className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm font-semibold">SaaS Builder</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                AIの力で、誰もがSaaSを作れる時代へ。
                アイデアを最速でプロダクトに変換します。
              </p>
            </div>

            {/* Links */}
            <div className="flex flex-wrap gap-8 text-sm">
              <div className="flex flex-col gap-3">
                <span className="font-medium">プロダクト</span>
                <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
                  機能
                </a>
                <a href="#templates" className="text-muted-foreground hover:text-foreground transition-colors">
                  テンプレート
                </a>
                <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">
                  使い方
                </a>
              </div>
              <div className="flex flex-col gap-3">
                <span className="font-medium">法的情報</span>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                  プライバシーポリシー
                </Link>
                <Link href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
                  利用規約
                </Link>
                <Link href="/contact" className="text-muted-foreground hover:text-foreground transition-colors">
                  お問い合わせ
                </Link>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-10 flex flex-col items-center gap-4 border-t pt-6 sm:flex-row sm:justify-between">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} SaaS Builder. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              {/* Social placeholders */}
              <a
                href="#"
                className="text-muted-foreground/50 transition-colors hover:text-foreground"
                aria-label="X (Twitter)"
              >
                <Circle className="h-5 w-5" />
              </a>
              <a
                href="#"
                className="text-muted-foreground/50 transition-colors hover:text-foreground"
                aria-label="GitHub"
              >
                <Circle className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
