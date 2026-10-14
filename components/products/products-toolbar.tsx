"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Button, { buttonVariants } from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import type { ProductFilters } from "@/lib/catalog/list";

type ProductsToolbarProps = {
  filters: ProductFilters;
  categories: { id: string; name: string }[];
};

const VIEWS: { value: ProductFilters["view"]; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "low", label: "Low stock" },
  { value: "archived", label: "Archived" },
];

export default function ProductsToolbar({ filters, categories }: ProductsToolbarProps) {
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

  const exportParams = new URLSearchParams(params.toString());
  exportParams.delete("page");

  return (
    <div className="border-line-strong flex flex-wrap items-center gap-2 border-b px-4 py-3">
      <form role="search" onSubmit={submit} className="flex min-w-[16em] flex-1 items-center gap-2">
        <Input aria-label="Search products, SKUs or barcodes" placeholder="Search name, SKU or scan a barcode" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button type="submit" variant="secondary" size="md">Search</Button>
      </form>
      <Select value={filters.category || "all"} onValueChange={(value) => update({ category: value === "all" ? "" : value })}>
        <SelectTrigger aria-label="Category" className="w-auto min-w-[10em]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div role="group" aria-label="Show" className="flex gap-1">
        {VIEWS.map((view) => (
          <Button
            key={view.value}
            variant="ghost"
            size="md"
            aria-pressed={filters.view === view.value}
            className="aria-pressed:bg-white/6 aria-pressed:text-foreground"
            onClick={() => update({ view: view.value === "active" ? "" : view.value })}
          >
            {view.label}
          </Button>
        ))}
      </div>
      <a href={`/products/export?${exportParams.toString()}`} className={buttonVariants({ variant: "secondary", size: "md" })}>
        Export CSV
      </a>
    </div>
  );
}
