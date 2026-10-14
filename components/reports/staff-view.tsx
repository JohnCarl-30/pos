import Link from "next/link";
import Tag from "@/components/_ui/tag";
import DetailSection from "@/components/_common/detail-section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import { staffFlags } from "@/lib/reports/flags";
import type { ReportRange } from "@/lib/reports/range";
import type { StaffReportRow } from "@/lib/reports/types";

type StaffViewProps = { rows: StaffReportRow[]; range: ReportRange; money: (minor: number) => string };

export default function StaffView({ rows, range, money }: StaffViewProps) {
  const dates = `from=${range.fromDate}&to=${range.toDate}`;
  return (
    <div className="flex max-w-[72em] flex-col">
      <DetailSection title="Staff">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="hidden text-right md:table-cell">Refunds</TableHead>
              <TableHead className="text-right">Voids</TableHead>
              <TableHead className="hidden text-right md:table-cell">Discounts</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const flags = staffFlags(row);
              return (
                <TableRow key={row.staff_id}>
                  <TableCell>
                    <span className="block">{row.name}</span>
                    <span className="caption-style text-soft mt-1 flex gap-3">
                      <Link href={`/orders?status=voided&cashier=${row.staff_id}&${dates}`} className="hover:text-foreground underline underline-offset-2">See voids</Link>
                      <Link href={`/orders?cashier=${row.staff_id}&${dates}`} className="hover:text-foreground underline underline-offset-2">See sales</Link>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.sales_count} · {money(row.sales_total)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{row.refund_count} · {money(row.refunds_total)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.void_count}
                    {row.cash_void_count > 0 ? ` · ${row.cash_void_count} cash` : ""}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{money(row.discounts)}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {flags.length === 0 ? <span className="text-soft">—</span> : flags.map((flag) => <Tag key={flag.rule} tone="amber" size="sm">{flag.label}</Tag>)}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DetailSection>
    </div>
  );
}
