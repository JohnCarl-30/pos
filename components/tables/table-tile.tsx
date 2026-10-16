import Link from "next/link";
import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import type { FloorTab } from "@/lib/tables/queries";
import { cn } from "@/lib/utils";

type TableTileProps = {
  label: string;
  seats: number | null;
  tab: FloorTab | null;
  now: number | null;
  money: (minor: number) => string;
  onOpen: () => void;
};

const TILE = "flex h-28 w-full flex-col items-start justify-between gap-1 rounded-xl p-3 text-left whitespace-normal";

export default function TableTile({ label, seats, tab, now, money, onOpen }: TableTileProps) {
  if (!tab) {
    return (
      <Button variant="ghost" size="none" aria-label={`Open ${label}`} className={cn(TILE, "text-foreground bg-white/4 hover:bg-white/8")} onClick={onOpen}>
        <span className="lead-style">{label}</span>
        <span className="caption-style text-soft">{seats ? `${seats} seats · Free` : "Free"}</span>
      </Button>
    );
  }
  const minutes = now === null ? null : Math.max(0, Math.floor((now - Date.parse(tab.openedAt)) / 60_000));
  return (
    <Link
      href={`/tabs/${tab.id}`}
      aria-label={`${label}, ${tab.itemCount} items, ${money(tab.total)}${tab.billPrinted ? ", bill printed" : ""}`}
      className={cn(TILE, "bg-primary/15 hover:bg-primary/25 transition-colors duration-150", tab.billPrinted && "ring-primary ring-2")}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="lead-style truncate">{label}</span>
        {tab.billPrinted && <Tag tone="purple" size="sm">Bill</Tag>}
      </span>
      <span className="text-[18px] leading-none font-semibold tabular-nums">{money(tab.total)}</span>
      <span className="caption-style text-soft w-full truncate tabular-nums">
        {[tab.guests ? `${tab.guests} guests` : null, minutes === null ? null : `${minutes} min`, tab.openedBy.split(" ")[0] || null].filter(Boolean).join(" · ")}
      </span>
    </Link>
  );
}
