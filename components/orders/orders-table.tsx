import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import StatusTag from "./status-tag";
import { formatMoney } from "@/lib/money";
import type { OrderListRow } from "@/lib/orders/queries";

type OrdersTableProps = { rows: OrderListRow[]; currency: string; timeZone: string };

export default function OrdersTable({ rows, currency, timeZone }: OrdersTableProps) {
  const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Receipt</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="hidden md:table-cell">Register</TableHead>
          <TableHead className="hidden md:table-cell">Cashier</TableHead>
          <TableHead className="hidden md:table-cell">Customer</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/orders/${row.id}`} className="hover:underline">#{row.receipt_number}</Link>
            </TableCell>
            <TableCell>{when.format(new Date(row.created_at))}</TableCell>
            <TableCell className="hidden md:table-cell">{row.register?.name ?? "—"}</TableCell>
            <TableCell className="hidden md:table-cell">{row.staff?.name ?? "—"}</TableCell>
            <TableCell className="hidden md:table-cell">{row.customer?.name ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(row.total, currency, "en-US")}</TableCell>
            <TableCell><StatusTag status={row.status} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
