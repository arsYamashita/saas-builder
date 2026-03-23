import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description:
    "SaaS Builderに関するご質問やご要望、バグ報告はこちらからお問い合わせください。通常2営業日以内にご返信いたします。",
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
