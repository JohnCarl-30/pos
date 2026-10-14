import Button from "@/components/_ui/button";
import DetailSection from "@/components/_common/detail-section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import { localDateTime } from "@/lib/reports/csv";
import { differenceLabel } from "@/lib/reports/shape";
import type { CashupRow } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

type CashupsViewProps = { rows: CashupRow[]; onlyOff: boolean; toggleHref: string; timeZone: string; money: (minor: number) => string };

const TONE = { short: "text-danger", over: "text-warning", balanced: "text-success" } as const;

export default function CashupsView({ rows, onlyOff, toggleHref, timeZone, money }: CashupsViewProps) {
  return (
    <div className="flex max-w-[72em] flex-col">
      <DetailSection
        title="Closed tills"
        action={
          <Button href={toggleHref} variant="ghost" size="md" aria-pressed={onlyOff} className="aria-pressed:text-foreground aria-pressed:bg-white/6">
            Short or over only
          </Button>
        }
      >
        {rows.length === 0 ? (
          <p className="text-soft">{onlyOff ? "Every till in this range balanced." : "No tills were closed in this range."}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Register</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead className="hidden md:table-cell">Closed by</TableHead>
                <TableHead className="hidden text-right md:table-cell">Float</TableHead>
                <TableHead className="hidden text-right md:table-cell">Cash sales</TableHead>
                <TableHead className="hidden text-right md:table-cell">Cash refunds</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="text-right">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const difference = differenceLabel(row.difference, money);
                return (
                  <TableRow key={row.session_id}>
                    <TableCell>
                      <span className="block">{row.register}</span>
                      {row.close_note && <span className="caption-style text-soft mt-1 block">{row.close_note}</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">{localDateTime(row.closed_at, timeZone)}</TableCell>
                    <TableCell className="hidden md:table-cell">{row.closed_by ?? "—"}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{money(row.opening_cash)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{money(row.cash_sales)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{row.cash_refunds > 0 ? `−${money(row.cash_refunds)}` : money(0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.expected_cash)}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.counted_cash === null ? "—" : money(row.counted_cash)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", TONE[difference.tone])}>{difference.text}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DetailSection>
    </div>
  );
}
