"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import { STOCK_REASON_LABELS, type HistoryFilters, type StockReason } from "@/lib/catalog/history";

export default function HistoryFiltersBar({ filters }: { filters: HistoryFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [values, setValues] = useState(filters);
  const filtersKey = JSON.stringify(filters);
  const [prevKey, setPrevKey] = useState(filtersKey);

  if (filtersKey !== prevKey) {
    setPrevKey(filtersKey);
    setValues(filters);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (values.q) next.set("q", values.q);
    if (values.reason) next.set("reason", values.reason);
    if (values.from) next.set("from", values.from);
    if (values.to) next.set("to", values.to);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <form onSubmit={submit} className="border-line-strong flex flex-wrap items-end gap-2 border-b px-4 py-3">
      <Input aria-label="Search product or SKU" placeholder="Product or SKU" className="min-w-[14em] flex-1" value={values.q} onChange={(event) => setValues({ ...values, q: event.target.value })} />
      <Select value={values.reason || "all"} onValueChange={(value) => setValues({ ...values, reason: value === "all" ? "" : (value as StockReason) })}>
        <SelectTrigger aria-label="Reason" className="w-auto min-w-[10em]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All reasons</SelectItem>
          {(Object.keys(STOCK_REASON_LABELS) as StockReason[]).map((reason) => (
            <SelectItem key={reason} value={reason}>{STOCK_REASON_LABELS[reason]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input type="date" aria-label="From date" className="w-auto" value={values.from} onChange={(event) => setValues({ ...values, from: event.target.value })} />
      <Input type="date" aria-label="To date" className="w-auto" value={values.to} onChange={(event) => setValues({ ...values, to: event.target.value })} />
      <Button type="submit" variant="secondary" size="md">Apply</Button>
    </form>
  );
}
