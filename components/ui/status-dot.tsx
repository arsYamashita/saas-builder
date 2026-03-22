import { cn } from "@/lib/utils/cn";

interface StatusDotProps {
  status: "online" | "offline" | "warning" | "idle";
  className?: string;
}

const statusStyles = {
  online: "bg-emerald-500",
  offline: "bg-red-500",
  warning: "bg-amber-500",
  idle: "bg-gray-400",
};

function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span className={cn("relative flex h-2.5 w-2.5", className)}>
      {status === "online" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2.5 w-2.5 rounded-full",
          statusStyles[status]
        )}
      />
    </span>
  );
}

export { StatusDot };
