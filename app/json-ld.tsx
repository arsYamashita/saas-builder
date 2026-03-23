export function JsonLd() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://saas-builder-cyan.vercel.app";

  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "SaaS Builder",
    description:
      "AIの力でSaaSアプリケーションを自動生成。アイデアを入力するだけで、ブループリント、データベース設計、API、UIコードまで一気通貫で作成します。",
    applicationCategory: "https://schema.org/DeveloperApplication",
    operatingSystem: "Web",
    url: baseUrl,
    softwareVersion: "1.0",
    datePublished: "2026-03-23",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "JPY",
    },
    author: {
      "@type": "Organization",
      name: "SaaS Builder",
    },
    inLanguage: "ja",
    featureList: [
      "AIによるブループリント自動生成",
      "データベース設計の自動化",
      "API・UIコードの一括生成",
      "Next.js + Supabase対応",
    ],
    screenshot: `${baseUrl}/opengraph-image`,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
