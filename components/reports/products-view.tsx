import Button from "@/components/_ui/button";
import DetailSection from "@/components/_common/detail-section";
import SegmentBar from "@/components/_common/segment-bar";
import Pagination from "@/components/products/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import type { ProductReportRow } from "@/lib/reports/types";

type ProductsViewProps = {
  rows: ProductReportRow[];
  categories: { category: string; netRevenue: number; share: number }[];
  sort: "revenue" | "units";
  page: number;
  pages: number;
  total: number;
  money: (minor: number) => string;
  sortHref: (sort: "revenue" | "units") => string;
  hrefFor: (page: number) => string;
};

export default function ProductsView({ rows, categories, sort, page, pages, total, money, sortHref, hrefFor }: ProductsViewProps) {
  return (
    <div className="flex max-w-[72em] flex-col">
      <DetailSection
        title="Best sellers"
        action={
          <div className="flex gap-1">
            {(["revenue", "units"] as const).map((value) => (
              <Button key={value} href={sortHref(value)} variant="ghost" size="md" aria-current={sort === value ? "true" : undefined} className="aria-[current=true]:text-foreground aria-[current=true]:bg-white/6">
                {value === "revenue" ? "By revenue" : "By units"}
              </Button>
            ))}
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="hidden text-right md:table-cell">Refunded</TableHead>
              <TableHead className="text-right">Net units</TableHead>
              <TableHead className="text-right">Net revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.variant_id ?? row.name}>
                <TableCell>{row.name}</TableCell>
                <TableCell className="hidden md:table-cell">{row.category ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{row.units_sold}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">{row.units_refunded}</TableCell>
                <TableCell className="text-right tabular-nums">{row.net_units}</TableCell>
                <TableCell className="text-right tabular-nums">{money(row.net_revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} pages={pages} total={total} hrefFor={hrefFor} />
      </DetailSection>
      <DetailSection title="By category">
        <ul className="flex flex-col gap-3">
          {categories.map((entry) => (
            <li key={entry.category} className="grid grid-cols-[minmax(6em,10em)_1fr_auto] items-center gap-3">
              <span className="truncate">{entry.category}</span>
              <SegmentBar percent={entry.share} segments={40} tone="success" className="h-3 w-full border border-white/4 px-px" segmentClassName="h-2" trackClassName="bg-white/8" />
              <span className="text-right tabular-nums">{money(entry.netRevenue)} · {entry.share}%</span>
            </li>
          ))}
        </ul>
      </DetailSection>
    </div>
  );
}
