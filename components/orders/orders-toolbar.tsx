"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import { ORDER_STATUS_LABELS, type OrderFilters, type OrderStatus } from "@/lib/orders/list";

type OrdersToolbarProps = { filters: OrderFilters; registers: { id: string; name: string }[]; cashiers: { id: string; name: string }[] };

export default function OrdersToolbar({ filters, registers, cashiers }: OrdersToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(filters.q);
  const [prevQuery, setPrevQuery] = useState(filters.q);
  if (filters.q !== prevQuery) {
    setPrevQuery(filters.q);
    setQuery(filters.q);
  }

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update({ q: query.trim() });
  }

  return (
    <div className="border-line-strong flex flex-wrap items-center gap-2 border-b px-4 py-3">
      <form role="search" onSubmit={submit} className="flex min-w-[16em] flex-1 items-center gap-2">
        <Input aria-label="Search receipt number or customer" placeholder="Receipt number or customer" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button type="submit" variant="secondary" size="md">Search</Button>
      </form>
      <Select value={filters.status || "all"} onValueChange={(value) => update({ status: value === "all" ? "" : value })}>
        <SelectTrigger aria-label="Status" className="w-auto min-w-[10em]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => (
            <SelectItem key={status} value={status}>{ORDER_STATUS_LABELS[status]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.register || "all"} onValueChange={(value) => update({ register: value === "all" ? "" : value })}>
        <SelectTrigger aria-label="Register" className="w-auto min-w-[9em]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All registers</SelectItem>
          {registers.map((register) => (
            <SelectItem key={register.id} value={register.id}>{register.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filters.cashier || "all"} onValueChange={(value) => update({ cashier: value === "all" ? "" : value })}>
        <SelectTrigger aria-label="Cashier" className="w-auto min-w-[9em]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All staff</SelectItem>
          {cashiers.map((cashier) => (
            <SelectItem key={cashier.id} value={cashier.id}>{cashier.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input type="date" aria-label="From" className="w-auto" value={filters.from} onChange={(event) => update({ from: event.target.value })} />
      <Input type="date" aria-label="To" className="w-auto" value={filters.to} onChange={(event) => update({ to: event.target.value })} />
    </div>
  );
}
