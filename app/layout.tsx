import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "AI SaaS Builder",
    template: "%s | AI SaaS Builder",
  },
  description:
    "AIが本番品質のSaaSコードを自動生成。Next.js + Supabase + Stripe ベースのSaaSを数分で構築。",
  metadataBase: new URL("https://saas-builder.app"),
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "AI SaaS Builder",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
