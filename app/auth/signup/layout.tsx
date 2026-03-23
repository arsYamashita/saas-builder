import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "新規登録",
  description:
    "SaaS Builderのアカウントを無料で作成。AIの力でSaaSアプリケーションを自動生成しましょう。",
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
