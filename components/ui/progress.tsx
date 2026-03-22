import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  variant?: "default" | "success" | "warning" | "destructive";
}

const variantStyles = {
  default: "bg-primary",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  destructive: "bg-destructive",
};

function Progress({
  value = 0,
  max = 100,
  variant = "default",
  className,
  ...props
}: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500 ease-out",
          variantStyles[variant]
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export { Progress };
