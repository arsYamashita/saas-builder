import Link from "next/link";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            &larr; トップページに戻る
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">{children}</main>
      <footer className="border-t bg-white">
        <div className="max-w-3xl mx-auto px-6 py-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} AI SaaS Builder
        </div>
      </footer>
    </div>
  );
}
