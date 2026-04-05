interface StatsCardProps {
  label: string;
  value: string | number;
  trend?: { value: number; direction: "up" | "down" };
}

export function StatsCard({ label, value, trend }: StatsCardProps) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {trend && (
        <p className={`text-xs mt-1 ${trend.direction === "up" ? "text-green-600" : "text-red-600"}`}>
          {trend.direction === "up" ? "▲" : "▼"} {Math.abs(trend.value)}%
        </p>
      )}
    </div>
  );
}
