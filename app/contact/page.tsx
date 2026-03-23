"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/* ---------- types ---------- */

type InquiryType =
  | "general"
  | "bug"
  | "feature"
  | "other";

interface FormData {
  name: string;
  email: string;
  inquiryType: InquiryType;
  message: string;
}

const inquiryOptions: { value: InquiryType; label: string }[] = [
  { value: "general", label: "一般的なお問い合わせ" },
  { value: "bug", label: "バグ報告" },
  { value: "feature", label: "機能リクエスト" },
  { value: "other", label: "その他" },
];

/* ---------- page ---------- */

export default function ContactPage() {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    inquiryType: "general",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // TODO: integrate with backend API
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-background bg-grid-pattern">
      {/* Back link */}
      <div className="mx-auto max-w-2xl px-6 pt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          ホームに戻る
        </Link>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* Page heading */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            お問い合わせ
          </h1>
          <p className="mt-3 text-muted-foreground">
            SaaS Builderに関するご質問やご要望がございましたら、
            <br className="hidden sm:block" />
            お気軽にお問い合わせください。
          </p>
        </div>

        {submitted ? (
          /* ---------- Success state ---------- */
          <Card className="text-center">
            <CardContent className="pt-10 pb-10 px-8">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                送信が完了しました
              </h2>
              <p className="text-sm text-muted-foreground mb-8">
                お問い合わせいただきありがとうございます。
                <br />
                内容を確認の上、通常2営業日以内にご返信いたします。
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSubmitted(false);
                    setFormData({
                      name: "",
                      email: "",
                      inquiryType: "general",
                      message: "",
                    });
                  }}
                >
                  新しいお問い合わせ
                </Button>
                <Button asChild>
                  <Link href="/">ホームに戻る</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* ---------- Form ---------- */
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">お問い合わせフォーム</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Name */}
                <div className="space-y-2">
                  <label
                    htmlFor="name"
                    className="text-sm font-medium leading-none"
                  >
                    お名前 <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="山田 太郎"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="text-sm font-medium leading-none"
                  >
                    メールアドレス <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="taro@example.com"
                    required
                    value={formData.email}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                  />
                </div>

                {/* Inquiry type */}
                <div className="space-y-2">
                  <label
                    htmlFor="inquiryType"
                    className="text-sm font-medium leading-none"
                  >
                    お問い合わせ種別
                  </label>
                  <select
                    id="inquiryType"
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-primary"
                    value={formData.inquiryType}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        inquiryType: e.target.value as InquiryType,
                      }))
                    }
                  >
                    {inquiryOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <label
                    htmlFor="message"
                    className="text-sm font-medium leading-none"
                  >
                    お問い合わせ内容 <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    id="message"
                    placeholder="お問い合わせ内容をご記入ください"
                    required
                    rows={6}
                    value={formData.message}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        message: e.target.value,
                      }))
                    }
                  />
                </div>

                {/* Submit */}
                <Button type="submit" size="lg" className="w-full">
                  送信する
                  <Send className="ml-2 h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Contact info */}
        <div className="mt-10 rounded-xl border bg-card p-6 text-center">
          <p className="text-sm font-medium text-foreground mb-1">
            メールでもお問い合わせいただけます
          </p>
          <a
            href="mailto:support@saas-builder.app"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Mail className="h-4 w-4" />
            support@saas-builder.app
          </a>
        </div>
      </div>
    </div>
  );
}
