"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        const res = await fetch("/api/auth/logout", {
          method: "POST",
        });

        const json = await res.json();

        if (!res.ok) {
          alert(json.error || "Logout failed");
          return;
        }

        router.push(json.redirectTo || "/auth/login");
        router.refresh();
      }}
    >
      <LogOut className="h-3.5 w-3.5" />
      Logout
    </Button>
  );
}
