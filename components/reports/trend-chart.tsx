import { tickLabel, trendBars } from "@/lib/reports/shape";
import type { TrendPoint } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

type TrendChartProps = { points: TrendPoint[]; kind: "hour" | "day"; money: (minor: number) => string };

export default function TrendChart({ points, kind, money }: TrendChartProps) {
  const bars = trendBars(points);
  const hasNegative = bars.some((bar) => bar.negative);
  const step = Math.max(1, Math.ceil(bars.length / 12));

  return (
    <figure className="flex flex-col gap-2">
      <div aria-hidden className="flex h-[12em] items-stretch gap-[2px]">
        {bars.map((bar) => (
          <div key={bar.bucket} className="group relative flex min-w-0 flex-1 flex-col">
            <div className={cn("flex items-end", hasNegative ? "basis-2/3" : "flex-1")}>
              {!bar.negative && <div className="bg-primary/80 group-hover:bg-primary w-full rounded-t-[2px] transition-colors duration-150" style={{ height: `${bar.height}%` }} />}
            </div>
            {hasNegative && (
              <div className="flex basis-1/3 items-start border-t border-white/10">
                {bar.negative && <div className="bg-danger/70 w-full rounded-b-[2px]" style={{ height: `${bar.height}%` }} />}
              </div>
            )}
            <span className="caption-style bg-popover pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md px-2 py-1 whitespace-nowrap tabular-nums shadow-overlay group-hover:block">
              {tickLabel(bar.bucket, kind)}{kind === "hour" ? ":00" : ""} · {money(bar.net)}
            </span>
          </div>
        ))}
      </div>
      <div aria-hidden className="caption-style text-soft flex gap-[2px]">
        {bars.map((bar, index) => (
          <span key={bar.bucket} className="min-w-0 flex-1 truncate text-center">
            {index % step === 0 ? tickLabel(bar.bucket, kind) : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Net sales by {kind}</caption>
        <thead>
          <tr>
            <th scope="col">{kind === "hour" ? "Hour" : "Day"}</th>
            <th scope="col">Net sales</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.bucket}>
              <td>{point.bucket}</td>
              <td>{money(point.net_sales)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
