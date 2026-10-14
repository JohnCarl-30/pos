import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import { formatPriceRange, type ProductRow } from "@/lib/catalog/list";
import { cn } from "@/lib/utils";

type ProductsTableProps = { rows: ProductRow[]; currency: string };

export default function ProductsTable({ rows, currency }: ProductsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Variants</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Stock here</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/products/${row.id}`} className="hover:underline">{row.name}</Link>
              {!row.active && <span className="caption-style text-subtle"> · archived</span>}
            </TableCell>
            <TableCell>{row.categoryName ?? "—"}</TableCell>
            <TableCell>{row.variantCount}</TableCell>
            <TableCell>{formatPriceRange(row, currency)}</TableCell>
            <TableCell className={cn(row.trackedStock !== null && row.trackedStock < 0 && "text-danger", row.lowStock && "text-warning")}>
              {row.trackedStock ?? "—"}
              {row.lowStock && <span className="caption-style"> · low</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
