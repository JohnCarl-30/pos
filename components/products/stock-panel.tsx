import StockActionDialog from "./stock-action-dialog";
import StockSettingsForm from "./stock-settings-form";
import { STOCK_REASON_LABELS, formatChange, withRunningQuantity, type StockReason } from "@/lib/catalog/history";
import { cn } from "@/lib/utils";

type StockVariant = { id: string; name: string; sku: string; active: boolean; quantity: number; track: boolean; lowStockAt: number | null };
type Movement = { id: string; variant_id: string; quantity_change: number; reason: StockReason; note: string | null; created_at: string; staff: { name: string } | null };

type StockPanelProps = {
  variants: StockVariant[];
  movements: Movement[];
  otherStores: { id: string; name: string }[];
  timeZone: string;
};

export default function StockPanel({ variants, movements, otherStores, timeZone }: StockPanelProps) {
  const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone });
  return (
    <ul className="flex flex-col gap-4 p-4">
      {variants.map((variant) => {
        const history = withRunningQuantity(movements.filter((movement) => movement.variant_id === variant.id).slice(0, 10), variant.quantity);
        const low = variant.track && variant.lowStockAt !== null && variant.quantity <= variant.lowStockAt;
        return (
          <li key={variant.id} className={cn("border-line-strong flex flex-col gap-3 rounded-lg border p-4", !variant.active && "opacity-60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <h2>{variant.name}</h2>
                <span className="caption-style text-subtle">{variant.sku}{variant.active ? "" : " · archived"}</span>
              </div>
              <div className="flex items-center gap-3">
                <span data-testid={`stock-${variant.sku}`} className={cn("lead-style", variant.quantity < 0 && "text-danger", low && "text-warning")}>
                  {variant.track ? variant.quantity : "Not tracked"}
                </span>
                <StockActionDialog variantId={variant.id} variantName={variant.name} quantity={variant.quantity} otherStores={otherStores} />
              </div>
            </div>
            <StockSettingsForm variantId={variant.id} variantName={variant.name} track={variant.track} lowStockAt={variant.lowStockAt} />
            {history.length > 0 && (
              <ol className="divide-line-strong divide-y">
                {history.map((entry) => (
                  <li key={entry.id} className="caption-style flex flex-wrap gap-x-3 gap-y-1 py-2">
                    <span className="text-subtle">{dateFormat.format(new Date(entry.created_at))}</span>
                    <span>{STOCK_REASON_LABELS[entry.reason]}</span>
                    <span className={entry.quantity_change < 0 ? "text-danger" : "text-success"}>{formatChange(entry.quantity_change)}</span>
                    <span className="text-subtle">→ {entry.resulting}</span>
                    <span className="text-subtle">{entry.staff?.name ?? "Staff"}</span>
                    {entry.note && <span className="text-subtle">· {entry.note}</span>}
                  </li>
                ))}
              </ol>
            )}
          </li>
        );
      })}
    </ul>
  );
}
