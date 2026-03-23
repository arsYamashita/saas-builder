import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description:
    "SaaS Builderのプライバシーポリシー。個人情報の取り扱い、データの保管、ユーザーの権利について説明します。",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            ホームに戻る
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          プライバシーポリシー
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          最終更新日: 2026年3月23日
        </p>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-muted-foreground">
          {/* Introduction */}
          <p>
            SaaS Builder（以下「本サービス」）は、ユーザーの個人情報の保護を重要と考え、
            以下のとおりプライバシーポリシーを定めます。本サービスをご利用いただくにあたり、
            本ポリシーの内容をご確認ください。
          </p>

          {/* 1. 個人情報の収集 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">
              1. 個人情報の収集
            </h2>
            <p className="mt-3">
              本サービスでは、サービスの提供にあたり以下の情報を収集する場合があります。
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-6">
              <li>メールアドレス</li>
              <li>パスワード（暗号化して保管）</li>
              <li>組織名・表示名</li>
              <li>サービス利用に伴うログ情報（アクセス日時、IPアドレス等）</li>
            </ul>
          </section>

          {/* 2. 利用目的 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">
              2. 利用目的
            </h2>
            <p className="mt-3">
              収集した個人情報は、以下の目的で利用します。
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-6">
              <li>本サービスの提供・運営</li>
              <li>ユーザー認証およびアカウント管理</li>
              <li>サービスの改善・新機能の開発</li>
              <li>重要なお知らせやメンテナンス情報の通知</li>
              <li>お問い合わせへの対応</li>
            </ul>
          </section>

          {/* 3. 第三者提供 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">
              3. 第三者への提供
            </h2>
            <p className="mt-3">
              本サービスは、以下の場合を除き、ユーザーの個人情報を第三者に提供することはありません。
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-6">
              <li>ユーザー本人の同意がある場合</li>
              <li>法令に基づく場合</li>
              <li>
                人の生命・身体・財産の保護のために必要であり、本人の同意を得ることが困難な場合
              </li>
            </ul>
          </section>

          {/* 4. Cookie */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">
              4. Cookieの使用
            </h2>
            <p className="mt-3">
              本サービスでは、ユーザー体験の向上およびサービスの改善を目的として、
              Cookieを使用する場合があります。Cookieはブラウザの設定により無効にすることが可能ですが、
              一部の機能が制限される場合があります。
            </p>
          </section>

          {/* 5. データの保管とセキュリティ */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">
              5. データの保管とセキュリティ
            </h2>
            <p className="mt-3">
              ユーザーの個人情報は、Supabaseが提供するクラウドインフラストラクチャ上に保管されます。
              データの保護にあたり、以下のセキュリティ対策を実施しています。
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-6">
              <li>通信の暗号化（SSL/TLS）</li>
              <li>パスワードのハッシュ化</li>
              <li>アクセス制御によるデータ保護（Row Level Security）</li>
              <li>定期的なセキュリティレビュー</li>
            </ul>
          </section>

          {/* 6. ユーザーの権利 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">
              6. ユーザーの権利
            </h2>
            <p className="mt-3">
              ユーザーは、自身の個人情報について以下の権利を有します。
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-6">
              <li>
                <span className="font-medium text-foreground">
                  アクセス権:
                </span>{" "}
                保有する個人情報の開示を請求できます
              </li>
              <li>
                <span className="font-medium text-foreground">修正権:</span>{" "}
                個人情報の訂正・更新を請求できます
              </li>
              <li>
                <span className="font-medium text-foreground">削除権:</span>{" "}
                アカウントおよび個人情報の削除を請求できます
              </li>
            </ul>
            <p className="mt-3">
              上記の権利行使をご希望の場合は、下記のお問い合わせ先までご連絡ください。
            </p>
          </section>

          {/* 7. お問い合わせ先 */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">
              7. お問い合わせ先
            </h2>
            <p className="mt-3">
              本ポリシーに関するお問い合わせは、本サービス内の
              <Link
                href="/contact"
                className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
              >
                お問い合わせページ
              </Link>
              よりご連絡ください。
            </p>
          </section>

          {/* 8. 改定について */}
          <section>
            <h2 className="text-lg font-semibold text-foreground">
              8. プライバシーポリシーの改定
            </h2>
            <p className="mt-3">
              本ポリシーは、法令の変更やサービス内容の変更に伴い、予告なく改定される場合があります。
              改定後のポリシーは、本ページに掲載された時点で効力を生じるものとします。
              重要な変更がある場合は、サービス内またはメールにてお知らせします。
            </p>
          </section>
        </div>

        {/* Footer nav */}
        <div className="mt-16 border-t pt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            ホームに戻る
          </Link>
        </div>
      </main>
    </div>
  );
}
