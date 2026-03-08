import Link from "next/link";
import { LogoutButton } from "@/components/admin/logout-button";

export function AdminNav() {
  return (
    <nav className="flex items-center gap-4 text-sm border-b pb-3 mb-6">
      <Link href="/dashboard" className="underline">
        Dashboard
      </Link>
      <Link href="/content" className="underline">
        Contents
      </Link>
      <Link href="/plans" className="underline">
        Plans
      </Link>
      <Link href="/billing" className="underline">
        Billing
      </Link>
      <Link href="/affiliate" className="underline">
        Affiliate
      </Link>
      <div className="ml-auto">
        <LogoutButton />
      </div>
    </nav>
  );
}
