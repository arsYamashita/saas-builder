"use client";

import { useLogout } from "@/hooks/use-logout";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const logout = useLogout();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={logout}
    >
      <LogOut className="h-3.5 w-3.5" />
      ログアウト
    </Button>
  );
}
