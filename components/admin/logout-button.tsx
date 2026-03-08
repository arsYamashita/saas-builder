"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      className="rounded border px-3 py-2 text-sm"
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
      Logout
    </button>
  );
}
