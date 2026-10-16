import { priceCart } from "@/lib/checkout";
import { cartInputs, cartLineFor, type CartLine, type Discount, type RegisterProduct } from "@/lib/register/cart";

export type TabLine = {
  id: string;
  variantId: string | null;
  optionIds: string[];
  name: string;
  quantity: number;
  paidQuantity: number;
  note: string | null;
  sentAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
};

export type TabLineRow = {
  id: string;
  variant_id: string | null;
  option_ids: string[];
  name: string;
  quantity: number;
  paid_quantity: number;
  note: string | null;
  sent_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

export type PayPick = Record<string, number>;
export type PayPart = { tabItemId: string; quantity: number; discountBps: number | null; discountAmount: number | null };

export const TAB_LINE_SELECT = "id, variant_id, option_ids, name, quantity, paid_quantity, note, sent_at, voided_at, void_reason, added_at";

export function toTabLine(row: TabLineRow): TabLine {
  return {
    id: row.id,
    variantId: row.variant_id,
    optionIds: row.option_ids,
    name: row.name,
    quantity: row.quantity,
    paidQuantity: row.paid_quantity,
    note: row.note,
    sentAt: row.sent_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
  };
}

export function leftToPay(line: TabLine): number {
  return line.voidedAt ? 0 : line.quantity - line.paidQuantity;
}

export function pickAll(lines: TabLine[]): PayPick {
  return Object.fromEntries(lines.filter((line) => leftToPay(line) > 0).map((line) => [line.id, leftToPay(line)]));
}

export function setPick(pick: PayPick, line: TabLine, quantity: number): PayPick {
  const next = { ...pick };
  const clamped = Math.min(leftToPay(line), Math.max(0, Math.floor(quantity)));
  if (clamped === 0) delete next[line.id];
  else next[line.id] = clamped;
  return next;
}

export function partsFrom(pick: PayPick, discounts: Record<string, Discount>): PayPart[] {
  return Object.entries(pick)
    .filter(([, quantity]) => quantity > 0)
    .map(([tabItemId, quantity]) => {
      const discount = discounts[tabItemId] ?? null;
      return {
        tabItemId,
        quantity,
        discountBps: discount && "bps" in discount ? discount.bps : null,
        discountAmount: discount && "amount" in discount ? discount.amount : null,
      };
    });
}

export function tabCartLines(lines: TabLine[], products: RegisterProduct[], pick: PayPick, discounts: Record<string, Discount>): { lines: CartLine[]; missing: string[] } {
  const result: CartLine[] = [];
  const missing: string[] = [];
  for (const line of lines) {
    const quantity = pick[line.id] ?? 0;
    if (quantity <= 0) continue;
    const product = products.find((entry) => entry.variants.some((variant) => variant.id === line.variantId));
    const variant = product?.variants.find((entry) => entry.id === line.variantId);
    if (!product || !variant) {
      missing.push(line.name);
      continue;
    }
    const discount = discounts[line.id] ?? null;
    result.push({
      ...cartLineFor(product, variant, line.optionIds, quantity, line.id),
      discountBps: discount && "bps" in discount ? discount.bps : null,
      discountAmount: discount && "amount" in discount ? discount.amount : null,
    });
  }
  return { lines: result, missing };
}

export function tabTotal(lines: TabLine[], products: RegisterProduct[], pricesIncludeTax: boolean): number {
  const cart = tabCartLines(lines, products, pickAll(lines), {}).lines;
  if (cart.length === 0) return 0;
  try {
    return priceCart(cartInputs(cart), null, pricesIncludeTax).total;
  } catch {
    return 0;
  }
}

export function tabLabel(tableName: string | null, name: string | null): string {
  if (tableName && name) return `${tableName} · ${name}`;
  return tableName ?? name ?? "Tab";
}
