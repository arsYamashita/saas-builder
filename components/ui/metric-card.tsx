import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { LucideIcon } from "lucide-react";

interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}

function MetricCard({
  label,
  value,
  sublabel,
  icon: Icon,
  trend,
  trendValue,
  className,
  ...props
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5 shadow-card transition-shadow duration-200 hover:shadow-card-hover",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="mt-2">
        <p className="text-2xl font-bold tracking-tight text-foreground">
          {value}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {trend && trendValue && (
            <span
              className={cn(
                "text-xs font-medium",
                trend === "up" && "text-emerald-600",
                trend === "down" && "text-red-600",
                trend === "neutral" && "text-muted-foreground"
              )}
            >
              {trend === "up" ? "+" : trend === "down" ? "-" : ""}
              {trendValue}
            </span>
          )}
          {sublabel && (
            <span className="text-xs text-muted-foreground">{sublabel}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export { MetricCard };
