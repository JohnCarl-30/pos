"use client";

import Button from "@/components/_ui/button";
import type { RegisterProduct } from "@/lib/register/cart";
import { cn } from "@/lib/utils";

const TILE_COLORS = [
  "bg-sky-500/15",
  "bg-emerald-500/15",
  "bg-amber-500/15",
  "bg-rose-500/15",
  "bg-violet-500/15",
  "bg-teal-500/15",
  "bg-orange-500/15",
  "bg-fuchsia-500/15",
];

type ProductGridProps = {
  products: RegisterProduct[];
  categoryIndex: Map<string, number>;
  money: (minor: number) => string;
  onPick: (product: RegisterProduct) => void;
};

export default function ProductGrid({ products, categoryIndex, money, onPick }: ProductGridProps) {
  if (products.length === 0) return <span className="caption-style text-subtle block p-4">No products match.</span>;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 p-3">
      {products.map((product) => {
        const prices = product.variants.map((variant) => variant.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const outOfStock = product.variants.every((variant) => variant.track && variant.quantity <= 0);
        const color = product.categoryId ? TILE_COLORS[(categoryIndex.get(product.categoryId) ?? 0) % TILE_COLORS.length] : "bg-white/5";
        return (
          <li key={product.id}>
            <Button
              variant="ghost"
              size="none"
              aria-label={`Add ${product.name}`}
              className={cn("text-foreground flex h-24 w-full flex-col items-start justify-between rounded-xl p-3 text-left whitespace-normal", color)}
              onClick={() => onPick(product)}
            >
              <span className="lead-style line-clamp-2">{product.name}</span>
              <span className="caption-style flex w-full items-center justify-between gap-2">
                <span>{min === max ? money(min) : `${money(min)}+`}</span>
                {outOfStock && <span className="text-danger">Out of stock</span>}
              </span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
