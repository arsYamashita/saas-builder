import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ログイン",
  description:
    "SaaS Builderにログイン。AIでSaaSアプリケーションを構築しましょう。",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
