"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background bg-grid-pattern flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-10 pb-10 px-8">
          {/* Illustration */}
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
            <svg
              className="h-12 w-12 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>

          {/* Error code */}
          <p className="text-6xl font-bold text-gradient mb-3">404</p>

          {/* Heading */}
          <h1 className="text-xl font-semibold text-foreground mb-2">
            ページが見つかりません
          </h1>

          {/* Description */}
          <p className="text-sm text-muted-foreground mb-8">
            お探しのページは存在しないか、移動した可能性があります。
          </p>

          {/* Action */}
          <Button asChild size="lg" className="w-full">
            <Link href="/">ホームに戻る</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
