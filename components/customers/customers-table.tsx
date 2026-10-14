import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import { formatMoney } from "@/lib/money";
import type { CustomerRow } from "@/lib/customers/list";

type CustomersTableProps = { rows: CustomerRow[]; currency: string; timeZone: string };

export default function CustomersTable({ rows, currency, timeZone }: CustomersTableProps) {
  const day = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead className="text-right">Total spent</TableHead>
          <TableHead>Last visit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/customers/${row.id}`} className="hover:underline">{row.name}</Link>
            </TableCell>
            <TableCell>{row.email ?? "—"}</TableCell>
            <TableCell>{row.phone ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(row.totalSpent, currency, "en-US")}</TableCell>
            <TableCell>{row.lastVisit ? day.format(new Date(row.lastVisit)) : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
