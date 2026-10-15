import { tickLabel, trendBars } from "@/lib/reports/shape";
import type { TrendPoint } from "@/lib/reports/types";

type TrendChartProps = { points: TrendPoint[]; kind: "hour" | "day"; money: (minor: number) => string };

export default function TrendChart({ points, kind, money }: TrendChartProps) {
  const { positivePart, bars } = trendBars(points);
  const step = Math.max(1, Math.ceil(bars.length / 12));
  const label = (bucket: string) => `${tickLabel(bucket, kind)}${kind === "hour" ? ":00" : ""}`;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="sr-only">Net sales by {kind}. Focus a bar to read its value.</figcaption>
      <div className="flex h-[12em] items-stretch gap-[2px]">
        {bars.map((bar) => (
          <div
            key={bar.bucket}
            role="img"
            tabIndex={0}
            aria-label={`${label(bar.bucket)} net sales ${money(bar.net)}`}
            className="group focus-visible:ring-ring/60 relative flex min-w-0 flex-1 flex-col rounded-[2px] outline-none focus-visible:ring-2"
          >
            <div className="flex items-end" style={{ flexBasis: `${positivePart}%` }}>
              {!bar.negative && (
                <div className="bg-primary/80 group-hover:bg-primary group-focus:bg-primary w-full rounded-t-[2px] transition-colors duration-150" style={{ height: `${bar.height}%` }} />
              )}
            </div>
            {positivePart < 100 && (
              <div className="flex items-start border-t border-white/10" style={{ flexBasis: `${100 - positivePart}%` }}>
                {bar.negative && <div className="bg-danger/70 w-full rounded-b-[2px]" style={{ height: `${bar.height}%` }} />}
              </div>
            )}
            <span
              aria-hidden
              className="caption-style bg-popover pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md px-2 py-1 whitespace-nowrap tabular-nums shadow-overlay group-hover:block group-focus:block"
            >
              {label(bar.bucket)} · {money(bar.net)}
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
    </figure>
  );
}
