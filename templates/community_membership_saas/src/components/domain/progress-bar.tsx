"use client";

import { useEffect, useState } from "react";

interface ProgressBarProps {
  /** Number of completed items */
  completed: number;
  /** Total number of items */
  total: number;
  /** Optional label displayed above the bar */
  label?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

/**
 * Visual progress bar with animated fill and Japanese labels.
 *
 * Color shifts to green when 100% is reached.
 * Shows "○/○ 完了" and "○% 達成" by default.
 */
export function ProgressBar({
  completed,
  total,
  label,
  size = "md",
}: ProgressBarProps) {
  const [animatedWidth, setAnimatedWidth] = useState(0);

  const safeTotal = Math.max(total, 1);
  const safeCompleted = Math.min(Math.max(completed, 0), safeTotal);
  const percentage = Math.round((safeCompleted / safeTotal) * 100);
  const isComplete = percentage === 100;

  // Animate fill on mount / value change
  useEffect(() => {
    const timeout = setTimeout(() => {
      setAnimatedWidth(percentage);
    }, 50);
    return () => clearTimeout(timeout);
  }, [percentage]);

  const heightClass = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  }[size];

  const barColor = isComplete
    ? "bg-gradient-to-r from-green-400 to-green-500"
    : "bg-gradient-to-r from-blue-400 to-blue-500";

  return (
    <div className="w-full" role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? `進捗 ${percentage}%`}>
      {/* Label row */}
      <div className="flex items-center justify-between mb-1.5">
        {label && (
          <span className="text-xs font-medium text-gray-600 truncate">
            {label}
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-gray-500 tabular-nums">
            {safeCompleted}/{safeTotal} 完了
          </span>
          <span
            className={`text-xs font-semibold tabular-nums ${
              isComplete ? "text-green-600" : "text-blue-600"
            }`}
          >
            {percentage}% 達成
          </span>
        </div>
      </div>

      {/* Track */}
      <div className={`w-full ${heightClass} bg-gray-100 rounded-full overflow-hidden`}>
        <div
          className={`${heightClass} ${barColor} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${animatedWidth}%` }}
        />
      </div>
    </div>
  );
}
