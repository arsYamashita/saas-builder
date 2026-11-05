"use client";

import { useRouter } from "next/navigation";

const FAILURE_MESSAGE = "ログアウトに失敗しました";

/**
 * ログアウトを実行する共通フック。
 * 画面を移すのは `res.ok && json.ok === true` のときだけ。
 * 500、JSON でない応答、通信失敗のときはエラーを表示してその場に残る。
 */
export function useLogout() {
  const router = useRouter();

  return async function logout(): Promise<boolean> {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      const json = await res.json();

      if (!res.ok || json?.ok !== true) {
        alert(
          (typeof json?.error === "string" && json.error) || FAILURE_MESSAGE
        );
        return false;
      }

      router.push(json.redirectTo || "/auth/login");
      router.refresh();
      return true;
    } catch {
      alert(FAILURE_MESSAGE);
      return false;
    }
  };
}
