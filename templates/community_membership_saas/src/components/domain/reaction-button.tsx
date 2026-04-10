"use client";

import { useState, useCallback } from "react";
import type { ReactionTargetType } from "@/types/database";

interface ReactionButtonProps {
  targetType: ReactionTargetType;
  targetId: string;
  tenantId: string;
  initialCount: number;
  initialLiked: boolean;
}

export function ReactionButton({
  targetType,
  targetId,
  tenantId,
  initialCount,
  initialLiked,
}: ReactionButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isLoading, setIsLoading] = useState(false);

  const toggle = useCallback(async () => {
    if (isLoading) return;

    // Optimistic update
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!liked);
    setCount(liked ? count - 1 : count + 1);
    setIsLoading(true);

    try {
      const res = await fetch(
        `/api/admin/tenants/${tenantId}/reactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_type: targetType,
            target_id: targetId,
            reaction_type: "like",
          }),
        }
      );

      if (!res.ok) {
        // Revert on failure
        setLiked(prevLiked);
        setCount(prevCount);
      }
    } catch {
      // Revert on network error
      setLiked(prevLiked);
      setCount(prevCount);
    } finally {
      setIsLoading(false);
    }
  }, [liked, count, isLoading, targetType, targetId, tenantId]);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isLoading}
      aria-label={liked ? "いいねを取り消す" : "いいねする"}
      aria-pressed={liked}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
        transition-all duration-200 ease-out select-none
        ${
          liked
            ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
            : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        }
        ${isLoading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
        active:scale-95
      `}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className={`
          w-4 h-4 transition-transform duration-200 ease-out
          ${liked ? "scale-110" : "scale-100"}
        `}
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={liked ? 0 : 2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
