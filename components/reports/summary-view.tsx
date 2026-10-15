import Link from "next/link";
import DetailSection from "@/components/_common/detail-section";
import Stat from "@/components/_common/stat";
import SegmentBar from "@/components/_common/segment-bar";
import TrendChart from "./trend-chart";
import type { ReportRange } from "@/lib/reports/range";
import type { SummaryReport, TrendPoint } from "@/lib/reports/types";

type SummaryViewProps = { summary: SummaryReport; trend: TrendPoint[]; range: ReportRange; money: (minor: number) => string };

const METHODS = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "other", label: "Other" },
] as const;

export default function SummaryView({ summary, trend, range, money }: SummaryViewProps) {
  const positive = METHODS.reduce((sum, method) => sum + Math.max(0, summary.methods[method.key]), 0);
  return (
    <div className="flex max-w-[72em] flex-col">
      <div className="flex flex-wrap gap-8 p-5 shadow-[inset_0_-1px_0_var(--line-strong)]">
        <Stat label="Net sales" value={money(summary.net_sales)} />
        <Stat label={summary.sales_count === 1 ? "Sale" : "Sales"} value={summary.sales_count} />
        <Stat label="Average sale" value={money(summary.average_sale)} />
        <Stat label="Refunds" value={money(summary.refunds_total)} />
        <Stat label="Discounts" value={money(summary.discounts)} />
        <Stat label="Tax" value={money(summary.net_tax)} />
      </div>
      <DetailSection title={range.bucket === "hour" ? "Net sales by hour" : "Net sales by day"}>
        <TrendChart points={trend} kind={range.bucket} money={money} />
      </DetailSection>
      <DetailSection title="Payment methods">
        <ul className="flex flex-col gap-3">
          {METHODS.map((method) => (
            <li key={method.key} className="grid grid-cols-[6em_1fr_auto] items-center gap-3">
              <span>{method.label}</span>
              <SegmentBar
                percent={positive > 0 ? (Math.max(0, summary.methods[method.key]) / positive) * 100 : 0}
                segments={40}
                tone="success"
                className="h-3 w-full border border-white/4 px-px"
                segmentClassName="h-2"
                trackClassName="bg-white/8"
              />
              <span className="text-right tabular-nums">{money(summary.methods[method.key])}</span>
            </li>
          ))}
        </ul>
      </DetailSection>
      <DetailSection title="Voids">
        {summary.void_count === 0 ? (
          <p className="text-soft">No voided sales.</p>
        ) : (
          <Link href={`/orders?status=voided&from=${range.fromDate}&to=${range.toDate}`} className="self-start hover:underline">
            {summary.void_count} voided {summary.void_count === 1 ? "sale" : "sales"} · <span className="tabular-nums">{money(summary.void_total)}</span>
          </Link>
        )}
      </DetailSection>
    </div>
  );
}
