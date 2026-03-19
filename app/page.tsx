import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI SaaS Builder — SaaSを、つくれる人に。",
  description:
    "AIが本番品質のSaaSコードを自動生成。Next.js + Supabase + Stripe ベースのSaaSアプリケーションを、テンプレート選択からダウンロードまで数分で。",
  openGraph: {
    title: "AI SaaS Builder — SaaSを、つくれる人に。",
    description:
      "AIが本番品質のSaaSコードを自動生成。5つのテンプレートから選ぶだけ。",
    type: "website",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI SaaS Builder",
    description: "AIが本番品質のSaaSコードを自動生成。",
  },
};

const TEMPLATES = [
  {
    key: "mca",
    name: "会員コンテンツ配信",
    desc: "有料会員制コンテンツ配信 + アフィリエイト機能付きSaaS",
  },
  {
    key: "rsv",
    name: "予約管理 SaaS",
    desc: "日時予約、カレンダー管理、Stripe決済統合の予約プラットフォーム",
  },
  {
    key: "crm",
    name: "顧客管理 CRM",
    desc: "顧客情報管理、商談トラッキング、分析ダッシュボード",
  },
  {
    key: "cms",
    name: "コミュニティ会員制",
    desc: "コミュニティ運営、会員管理、コンテンツ配信プラットフォーム",
  },
  {
    key: "iao",
    name: "社内管理オペレーション",
    desc: "在庫管理、資産管理、社内オーダー管理の業務システム",
  },
];

const STEPS = [
  {
    num: "1",
    title: "テンプレートを選択",
    desc: "5つの業種特化テンプレートから、作りたいSaaSに最も近いものを選びます。",
  },
  {
    num: "2",
    title: "AIが自動生成",
    desc: "6段階のパイプラインで、設計からコード実装、DB設計、API設計まで自動生成。品質テスト付き。",
  },
  {
    num: "3",
    title: "ダウンロードして起動",
    desc: "ZIPでダウンロード。npm install && npm run dev ですぐにローカルで動きます。",
  },
];

const FAQS = [
  {
    q: "プログラミング知識は必要ですか？",
    a: "生成まではプログラミング不要です。ダウンロード後のカスタマイズにはNext.js/TypeScriptの基礎知識があると理想的ですが、セットアップガイドに従えばローカル起動まで進められます。",
  },
  {
    q: "生成されたコードはカスタマイズできますか？",
    a: "はい。生成されたコードはNext.js + TypeScriptの標準的なプロジェクト構成です。好きなエディタで自由にカスタマイズ・拡張できます。",
  },
  {
    q: "コードの所有権は誰にありますか？",
    a: "生成されたコードは100%あなたのものです。ロックインはなく、任意のホスティングサービスにデプロイできます。",
  },
  {
    q: "どのくらいの時間で生成されますか？",
    a: "テンプレートにより異なりますが、通常2〜5分で全工程が完了します。品質ゲート（lint、型チェック、テスト）を含みます。",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-24 text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            SaaSを、つくれる人に。
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-10">
            AIが本番品質のSaaSコードを自動生成。
            <br className="hidden md:block" />
            テンプレートを選んで、あとはAIにおまかせ。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/login"
              className="inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              無料で始める
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors border border-white/20"
            >
              仕組みを見る
            </a>
          </div>
          <div className="mt-12 flex flex-wrap justify-center gap-6 text-sm text-slate-400">
            <span>Next.js</span>
            <span>Supabase</span>
            <span>Stripe</span>
            <span>Gemini</span>
            <span>Claude</span>
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="bg-white py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-12">
            SaaS開発、こんな課題はありませんか？
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                before: "開発に数ヶ月かかる",
                after: "AIなら数分で生成",
                icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
              },
              {
                before: "技術選定に迷う",
                after: "検証済みスタックを自動構成",
                icon: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z",
              },
              {
                before: "決済実装が複雑",
                after: "Stripe統合済み",
                icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
              },
            ].map((item) => (
              <div
                key={item.before}
                className="text-center p-6 rounded-xl border border-gray-100 hover:shadow-lg transition-shadow"
              >
                <div className="w-12 h-12 mx-auto mb-4 bg-blue-50 rounded-full flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d={item.icon}
                    />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm line-through mb-1">
                  {item.before}
                </p>
                <p className="font-semibold text-gray-900">{item.after}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Templates */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-4">
            5つのテンプレート
          </h2>
          <p className="text-center text-gray-500 mb-12">
            業種に合わせたテンプレートを選ぶだけ。全テンプレート品質ゲート通過済み。
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            {TEMPLATES.map((t) => (
              <div
                key={t.key}
                className="bg-white rounded-xl p-5 border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <h3 className="font-semibold text-sm">{t.name}</h3>
                </div>
                <p className="text-sm text-gray-500">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="bg-white py-20">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-12">
            3ステップでSaaSが完成
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div key={s.num} className="text-center">
                <div className="w-10 h-10 mx-auto mb-4 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                  {s.num}
                </div>
                <h3 className="font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quality */}
      <section className="bg-slate-900 text-white py-20">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold mb-4">
            テストを通らないコードは、出しません。
          </h2>
          <p className="text-slate-400 mb-10 max-w-2xl mx-auto">
            AI生成コードは全て品質ゲートを通過。lint、型チェック、E2Eテストをパスしたコードだけがダウンロード可能です。
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {[
              "ESLint 通過",
              "TypeScript 型チェック 通過",
              "Playwright E2E 通過",
              "全5テンプレート GREEN",
            ].map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-900/30 border border-green-700/50 rounded-full text-sm text-green-300"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-12">
            よくある質問
          </h2>
          <div className="space-y-6">
            {FAQS.map((faq) => (
              <div key={faq.q} className="bg-white rounded-xl p-6 border">
                <h3 className="font-semibold mb-2">{faq.q}</h3>
                <p className="text-sm text-gray-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-white py-20">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold mb-4">
            今すぐSaaSを作り始めよう
          </h2>
          <p className="text-gray-500 mb-8">
            アカウント作成は無料。テンプレートを選んで、AIに任せるだけ。
          </p>
          <Link
            href="/auth/login"
            className="inline-flex items-center justify-center px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            無料で始める
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-sm font-semibold text-white">AI SaaS Builder</p>
            <div className="flex flex-wrap gap-6 text-sm">
              <Link
                href="/terms"
                className="hover:text-white transition-colors"
              >
                利用規約
              </Link>
              <Link
                href="/privacy"
                className="hover:text-white transition-colors"
              >
                プライバシーポリシー
              </Link>
              <Link
                href="/tokushoho"
                className="hover:text-white transition-colors"
              >
                特定商取引法に基づく表記
              </Link>
            </div>
          </div>
          <p className="text-center text-xs text-slate-600 mt-8">
            &copy; {new Date().getFullYear()} AI SaaS Builder. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
