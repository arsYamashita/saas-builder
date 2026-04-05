"use client";

import { useMemo } from "react";

// ─── Level tier color mapping ───
// 1-3: Green (初心者), 4-6: Blue (中級), 7-8: Purple (上級), 9: Gold (最上位)

const TIER_COLORS: Record<string, { bg: string; text: string; ring: string; bar: string }> = {
  green: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    bar: "bg-emerald-500",
  },
  blue: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    ring: "ring-blue-200",
    bar: "bg-blue-500",
  },
  purple: {
    bg: "bg-purple-50",
    text: "text-purple-700",
    ring: "ring-purple-200",
    bar: "bg-purple-500",
  },
  gold: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-300",
    bar: "bg-gradient-to-r from-amber-400 to-yellow-500",
  },
};

function getTierColor(level: number) {
  if (level <= 3) return TIER_COLORS.green;
  if (level <= 6) return TIER_COLORS.blue;
  if (level <= 8) return TIER_COLORS.purple;
  return TIER_COLORS.gold;
}

const SIZE_CLASSES = {
  sm: {
    wrapper: "px-1.5 py-0.5 text-[10px]",
    icon: "w-2.5 h-2.5",
    progressHeight: "h-0.5",
  },
  md: {
    wrapper: "px-2 py-1 text-xs",
    icon: "w-3 h-3",
    progressHeight: "h-1",
  },
  lg: {
    wrapper: "px-3 py-1.5 text-sm",
    icon: "w-3.5 h-3.5",
    progressHeight: "h-1.5",
  },
} as const;

interface LevelBadgeProps {
  /** Current level (1-9) */
  level: number;
  /** Level display name (e.g. "Newcomer", "Active") */
  name: string;
  /** Badge size variant */
  size?: "sm" | "md" | "lg";
  /** Current total points — enables progress bar to next level */
  currentPoints?: number;
  /** Points required for next level — enables progress bar */
  nextLevelPoints?: number | null;
  /** Next level name for tooltip display */
  nextLevelName?: string | null;
  /** Hide the level name text, show only the number */
  compact?: boolean;
}

export function LevelBadge({
  level,
  name,
  size = "md",
  currentPoints,
  nextLevelPoints,
  nextLevelName,
  compact = false,
}: LevelBadgeProps) {
  const tier = getTierColor(level);
  const sizeClass = SIZE_CLASSES[size];

  const progressPercent = useMemo(() => {
    if (
      currentPoints === undefined ||
      nextLevelPoints === undefined ||
      nextLevelPoints === null
    ) {
      return null;
    }
    // Points remaining to next level
    const pointsToNext = nextLevelPoints - currentPoints;
    if (pointsToNext <= 0) return 100;

    // We need the min_points of the current level to compute progress within the tier.
    // Since we don't have it directly, compute from nextLevelPoints and pointsToNext.
    // progress = (currentPoints - currentLevelMin) / (nextLevelMin - currentLevelMin)
    // Simplified: we use pointsToNext relative to the gap
    const gap = nextLevelPoints - (currentPoints - (nextLevelPoints - currentPoints));
    // Simpler: just use ratio of how far into the gap we are
    const totalGap = nextLevelPoints;
    const ratio = Math.min(1, Math.max(0, currentPoints / totalGap));
    return Math.round(ratio * 100);
  }, [currentPoints, nextLevelPoints]);

  const showProgress =
    progressPercent !== null && nextLevelPoints !== undefined && nextLevelPoints !== null;

  // Build tooltip text
  const tooltipParts = [`レベル${level}: ${name}`];
  if (nextLevelName && nextLevelPoints !== undefined && nextLevelPoints !== null && currentPoints !== undefined) {
    const remaining = nextLevelPoints - currentPoints;
    if (remaining > 0) {
      tooltipParts.push(`(次のレベルまであと${remaining}ポイント)`);
    }
  }
  const tooltipText = tooltipParts.join("");

  return (
    <div className="inline-flex flex-col items-start" title={tooltipText}>
      <span
        className={`
          inline-flex items-center gap-1 rounded-full font-bold leading-none
          ring-1
          ${tier.bg} ${tier.text} ${tier.ring}
          ${sizeClass.wrapper}
          transition-colors duration-200
        `}
        aria-label={tooltipText}
        role="status"
      >
        {/* Star icon for level 9 */}
        {level === 9 && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={sizeClass.icon}
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
              clipRule="evenodd"
            />
          </svg>
        )}
        <span>Lv.{level}</span>
        {!compact && <span>{name}</span>}
      </span>

      {/* Progress bar to next level */}
      {showProgress && (
        <div
          className={`
            w-full rounded-full bg-gray-200 mt-1 overflow-hidden
            ${sizeClass.progressHeight}
          `}
          role="progressbar"
          aria-valuenow={progressPercent ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`次のレベルへの進捗: ${progressPercent}%`}
        >
          <div
            className={`${tier.bar} ${sizeClass.progressHeight} rounded-full transition-all duration-500 ease-out`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
