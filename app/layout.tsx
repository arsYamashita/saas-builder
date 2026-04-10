import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { JsonLd } from "./json-ld";
import "@/lib/env";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://saas-builder-cyan.vercel.app"
  ),
  title: {
    default: "SaaS Builder — AIでSaaSを構築",
    template: "%s | SaaS Builder",
  },
  description: "AIの力でSaaSアプリケーションを自動生成。アイデアを入力するだけで、ブループリント、データベース設計、API、UIコードまで一気通貫で作成します。",
  keywords: ["SaaS", "AI", "コード生成", "ノーコード", "アプリ開発", "Next.js", "自動生成"],
  openGraph: {
    title: "SaaS Builder — AIでSaaSを構築",
    description: "AIの力でSaaSアプリケーションを自動生成。アイデアを入力するだけで、設計からコードまで。",
    type: "website",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: "SaaS Builder — AIでSaaSを構築",
    description: "AIの力でSaaSアプリケーションを自動生成。",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <JsonLd />
        {children}
      </body>
    </html>
  );
}
