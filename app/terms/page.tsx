import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "利用規約",
  description:
    "SaaS Builderの利用規約です。サービスのご利用前に必ずお読みください。",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            ホームに戻る
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight">利用規約</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          最終更新日: 2026年3月23日
        </p>

        <div className="mt-12 space-y-12 text-sm leading-relaxed text-foreground/90">
          {/* 第1条 */}
          <section>
            <h2 className="text-lg font-semibold">第1条（適用）</h2>
            <div className="mt-3 space-y-3">
              <p>
                本利用規約（以下「本規約」といいます）は、SaaS
                Builder（以下「当サービス」といいます）の利用に関する条件を、当サービスを利用するすべてのユーザー（以下「ユーザー」といいます）と当サービスの運営者（以下「運営者」といいます）との間で定めるものです。
              </p>
              <p>
                ユーザーは、当サービスを利用することにより、本規約に同意したものとみなされます。
              </p>
            </div>
          </section>

          {/* 第2条 */}
          <section>
            <h2 className="text-lg font-semibold">第2条（利用登録）</h2>
            <div className="mt-3 space-y-3">
              <p>
                当サービスの利用を希望する方は、所定の方法により利用登録を行うものとします。
              </p>
              <p>
                運営者は、以下の場合に利用登録を拒否することがあります。その理由について開示する義務を負いません。
              </p>
              <ul className="ml-5 list-disc space-y-1.5 text-muted-foreground">
                <li>登録情報に虚偽、誤記または記載漏れがあった場合</li>
                <li>過去に本規約に違反したことがある場合</li>
                <li>
                  その他、運営者が利用登録を適当でないと判断した場合
                </li>
              </ul>
            </div>
          </section>

          {/* 第3条 */}
          <section>
            <h2 className="text-lg font-semibold">第3条（アカウント管理）</h2>
            <div className="mt-3 space-y-3">
              <p>
                ユーザーは、自己の責任において当サービスのアカウント情報（メールアドレス、パスワード等）を適切に管理するものとします。
              </p>
              <p>
                アカウント情報の管理不十分、第三者の使用等による損害の責任はユーザーが負うものとし、運営者は一切の責任を負いません。
              </p>
              <p>
                ユーザーは、アカウントを第三者に譲渡、貸与または共有することはできません。
              </p>
            </div>
          </section>

          {/* 第4条 */}
          <section>
            <h2 className="text-lg font-semibold">第4条（禁止事項）</h2>
            <div className="mt-3 space-y-3">
              <p>
                ユーザーは、当サービスの利用にあたり、以下の行為を行ってはなりません。
              </p>
              <ul className="ml-5 list-disc space-y-1.5 text-muted-foreground">
                <li>法令または公序良俗に違反する行為</li>
                <li>犯罪行為に関連する行為</li>
                <li>
                  当サービスのサーバーまたはネットワークに過度の負荷をかける行為
                </li>
                <li>当サービスの運営を妨げる行為</li>
                <li>
                  当サービスのソフトウェアの逆コンパイル、逆アセンブル、リバースエンジニアリングを行う行為
                </li>
                <li>
                  当サービスに対するスクレイピング、クローリング等の自動データ収集行為
                </li>
                <li>不正アクセスまたはこれを試みる行為</li>
                <li>他のユーザーに関する個人情報を不正に収集・利用する行為</li>
                <li>
                  当サービスを利用して、違法、有害、脅迫的、虐待的、嫌がらせ、中傷的なコンテンツを生成する行為
                </li>
                <li>
                  その他、運営者が不適切と判断する行為
                </li>
              </ul>
            </div>
          </section>

          {/* 第5条 */}
          <section>
            <h2 className="text-lg font-semibold">
              第5条（サービスの提供・変更・停止）
            </h2>
            <div className="mt-3 space-y-3">
              <p>
                運営者は、ユーザーに事前に通知することなく、当サービスの内容を変更し、または当サービスの提供を停止もしくは中断することができるものとします。
              </p>
              <p>
                運営者は、以下の事由がある場合、当サービスの全部または一部の提供を停止または中断することがあります。
              </p>
              <ul className="ml-5 list-disc space-y-1.5 text-muted-foreground">
                <li>
                  当サービスに係るシステムの保守点検または更新を行う場合
                </li>
                <li>
                  地震、落雷、火災、停電等の不可抗力により当サービスの提供が困難となった場合
                </li>
                <li>
                  その他、運営者が当サービスの提供が困難と判断した場合
                </li>
              </ul>
              <p>
                運営者は、当サービスの提供の停止または中断により、ユーザーまたは第三者が被ったいかなる損害についても、一切の責任を負いません。
              </p>
            </div>
          </section>

          {/* 第6条 */}
          <section>
            <h2 className="text-lg font-semibold">
              第6条（AI生成コードの取扱い）
            </h2>
            <div className="mt-3 space-y-3">
              <p>
                当サービスのAI機能により生成されたコード、設計書、その他の成果物（以下「生成物」といいます）の著作権は、ユーザーに帰属します。
              </p>
              <p>
                ユーザーは、生成物を自由に使用、複製、改変、頒布することができます。
              </p>
              <p>
                ただし、運営者は、サービス改善の目的で、匿名化された生成物の統計情報を利用することがあります。
              </p>
            </div>
          </section>

          {/* 第7条 */}
          <section>
            <h2 className="text-lg font-semibold">第7条（免責事項）</h2>
            <div className="mt-3 space-y-3">
              <p>
                運営者は、当サービスのAIが生成するコードおよび成果物の完全性、正確性、有用性、安全性、特定目的への適合性等について、明示的にも黙示的にも保証しません。
              </p>
              <p>
                AI生成物を本番環境で使用する場合、ユーザーの責任において十分なテスト・検証を行うものとします。
              </p>
              <p>
                運営者は、当サービスに起因してユーザーに生じたあらゆる損害について、運営者の故意または重大な過失による場合を除き、一切の責任を負いません。
              </p>
            </div>
          </section>

          {/* 第8条 */}
          <section>
            <h2 className="text-lg font-semibold">第8条（利用料金）</h2>
            <div className="mt-3 space-y-3">
              <p>
                当サービスは、基本機能を無料で提供します。
              </p>
              <p>
                運営者は、将来的に有料プランを導入する場合があります。有料プランの導入にあたっては、事前にユーザーに通知し、料金体系および支払い条件を明示します。
              </p>
              <p>
                有料プランの利用料金の支払い方法、返金ポリシー等については、別途定める料金規定に従うものとします。
              </p>
            </div>
          </section>

          {/* 第9条 */}
          <section>
            <h2 className="text-lg font-semibold">第9条（退会）</h2>
            <div className="mt-3 space-y-3">
              <p>
                ユーザーは、所定の手続きにより、いつでも当サービスから退会することができます。
              </p>
              <p>
                退会した場合、ユーザーのアカウントに紐づくデータは、運営者の定める期間経過後に削除されます。ただし、法令に基づき保存が必要なデータについてはこの限りではありません。
              </p>
            </div>
          </section>

          {/* 第10条 */}
          <section>
            <h2 className="text-lg font-semibold">第10条（利用規約の変更）</h2>
            <div className="mt-3 space-y-3">
              <p>
                運営者は、必要と判断した場合には、ユーザーに通知することなく、いつでも本規約を変更することができるものとします。
              </p>
              <p>
                変更後の利用規約は、当サービス上に掲示した時点から効力を生じるものとします。
              </p>
              <p>
                本規約の変更後に当サービスの利用を継続した場合、ユーザーは変更後の規約に同意したものとみなされます。
              </p>
            </div>
          </section>

          {/* 第11条 */}
          <section>
            <h2 className="text-lg font-semibold">
              第11条（準拠法・管轄裁判所）
            </h2>
            <div className="mt-3 space-y-3">
              <p>本規約の解釈にあたっては、日本法を準拠法とします。</p>
              <p>
                当サービスに関して紛争が生じた場合には、運営者の本店所在地を管轄する裁判所を専属的合意管轄とします。
              </p>
            </div>
          </section>
        </div>

        {/* Bottom back link */}
        <div className="mt-16 border-t pt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            ホームに戻る
          </Link>
        </div>
      </main>
    </div>
  );
}
