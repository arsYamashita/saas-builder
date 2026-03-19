import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記",
};

export default function TokushohoPage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1>特定商取引法に基づく表記</h1>

      <table>
        <tbody>
          <tr>
            <th className="text-left align-top whitespace-nowrap pr-8">
              販売事業者
            </th>
            <td>[事業者名を記載]</td>
          </tr>
          <tr>
            <th className="text-left align-top whitespace-nowrap pr-8">
              運営責任者
            </th>
            <td>[氏名を記載]</td>
          </tr>
          <tr>
            <th className="text-left align-top whitespace-nowrap pr-8">
              所在地
            </th>
            <td>[住所を記載]</td>
          </tr>
          <tr>
            <th className="text-left align-top whitespace-nowrap pr-8">
              連絡先
            </th>
            <td>
              メール: [メールアドレスを記載]
              <br />
              ※お問い合わせはメールにてお願いいたします
            </td>
          </tr>
          <tr>
            <th className="text-left align-top whitespace-nowrap pr-8">
              販売価格
            </th>
            <td>
              Free プラン: 0円
              <br />
              Pro プラン: 月額2,980円（税込）
              <br />
              ※その他のプランについてはサービス内で表示される価格に準じます
            </td>
          </tr>
          <tr>
            <th className="text-left align-top whitespace-nowrap pr-8">
              販売価格以外の必要料金
            </th>
            <td>
              インターネット接続に必要な通信費用はお客様のご負担となります。
            </td>
          </tr>
          <tr>
            <th className="text-left align-top whitespace-nowrap pr-8">
              支払方法
            </th>
            <td>クレジットカード（Stripe経由）</td>
          </tr>
          <tr>
            <th className="text-left align-top whitespace-nowrap pr-8">
              支払時期
            </th>
            <td>
              月額プラン: 申込時および毎月の更新日に自動課金
              <br />
              年額プラン: 申込時および毎年の更新日に自動課金
            </td>
          </tr>
          <tr>
            <th className="text-left align-top whitespace-nowrap pr-8">
              サービス提供時期
            </th>
            <td>
              アカウント作成後、即時ご利用いただけます。有料プランは決済完了後、即時適用されます。
            </td>
          </tr>
          <tr>
            <th className="text-left align-top whitespace-nowrap pr-8">
              返品・キャンセル
            </th>
            <td>
              デジタルコンテンツの性質上、購入後の返品・返金には対応いたしかねます。ただし、サービスに重大な瑕疵がある場合はご連絡ください。サブスクリプションはいつでも解約可能で、次の更新日から課金が停止されます。
            </td>
          </tr>
          <tr>
            <th className="text-left align-top whitespace-nowrap pr-8">
              動作環境
            </th>
            <td>
              最新版の Chrome, Firefox, Safari, Edge
              <br />
              インターネット接続環境
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
