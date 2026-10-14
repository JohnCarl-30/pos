import { calculateLine, divRoundHalfEven } from "./tax";

export type CartLineInput = { price: number; quantity: number; rateBps: number; discountBps?: number | null; discountAmount?: number | null };
export type OrderDiscountInput = { bps?: number | null; amount?: number | null } | null;
export type PricedLine = { discount: number; tax: number; lineTotal: number };
export type PricedCart = { subtotal: number; discountTotal: number; taxTotal: number; total: number; lines: PricedLine[] };
export type CheckoutVector = { name: string; pricesIncludeTax: boolean; lines: CartLineInput[]; orderDiscount: OrderDiscountInput; expected: PricedCart };
export type PaymentMethod = "cash" | "card" | "other";
export type PaymentInput = { method: PaymentMethod; amount: number; tendered?: number | null; reference?: string | null };
export type PaymentSummary = { paid: number; remaining: number; change: number; complete: boolean; error: string | null };

export class CartError extends Error {}

function discountFrom(base: number, bps: number | null | undefined, amount: number | null | undefined): number {
  if (bps !== null && bps !== undefined && amount !== null && amount !== undefined) throw new CartError("Choose a percentage or an amount, not both");
  if (bps !== null && bps !== undefined) {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new CartError("A percentage must be between 0 and 100");
    return Number(divRoundHalfEven(BigInt(base) * BigInt(bps), 10_000n));
  }
  if (amount !== null && amount !== undefined) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > base) throw new CartError("A discount can't be more than the amount it applies to");
    return amount;
  }
  return 0;
}

export function allocate(amount: number, bases: number[]): number[] {
  const total = bases.reduce((sum, value) => sum + value, 0);
  if (amount === 0 || total === 0) return bases.map(() => 0);
  const big = BigInt(amount);
  const bigTotal = BigInt(total);
  const shares = bases.map((base) => (big * BigInt(base)) / bigTotal);
  const remainders = bases.map((base) => (big * BigInt(base)) % bigTotal);
  let left = big - shares.reduce((sum, value) => sum + value, 0n);
  const order = bases.map((_, index) => index).sort((a, b) => (remainders[b] > remainders[a] ? 1 : remainders[b] < remainders[a] ? -1 : a - b));
  for (const index of order) {
    if (left === 0n) break;
    shares[index] += 1n;
    left -= 1n;
  }
  return shares.map(Number);
}

export function priceCart(lines: CartLineInput[], orderDiscount: OrderDiscountInput, pricesIncludeTax: boolean): PricedCart {
  const gross = lines.map((line) => {
    if (!Number.isSafeInteger(line.price) || line.price < 0) throw new CartError("Prices must be whole minor units");
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 9_999) throw new CartError("Quantity must be between 1 and 9999");
    return line.price * line.quantity;
  });
  const lineDiscounts = lines.map((line, index) => discountFrom(gross[index], line.discountBps, line.discountAmount));
  const bases = gross.map((value, index) => value - lineDiscounts[index]);
  const afterLines = bases.reduce((sum, value) => sum + value, 0);
  const orderAmount = orderDiscount ? discountFrom(afterLines, orderDiscount.bps, orderDiscount.amount) : 0;
  const allocations = allocate(orderAmount, bases);

  const priced = lines.map((line, index) => {
    const amount = bases[index] - allocations[index];
    const totals = calculateLine({ unitPrice: amount, quantity: 1, discount: 0, rateBps: line.rateBps, pricesIncludeTax });
    return { discount: lineDiscounts[index] + allocations[index], tax: totals.tax, lineTotal: totals.gross };
  });

  return {
    subtotal: gross.reduce((sum, value) => sum + value, 0),
    discountTotal: priced.reduce((sum, line) => sum + line.discount, 0),
    taxTotal: priced.reduce((sum, line) => sum + line.tax, 0),
    total: priced.reduce((sum, line) => sum + line.lineTotal, 0),
    lines: priced,
  };
}

export function discountShareBps(subtotal: number, discountTotal: number): number {
  if (subtotal <= 0 || discountTotal <= 0) return 0;
  const numerator = BigInt(discountTotal) * 10_000n;
  const denominator = BigInt(subtotal);
  return Number((numerator + denominator - 1n) / denominator);
}

export function summarisePayments(total: number, payments: PaymentInput[]): PaymentSummary {
  let paid = 0;
  let change = 0;
  let error: string | null = null;
  for (const payment of payments) {
    if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0) error ??= "Each payment needs an amount above 0";
    if (payment.tendered !== null && payment.tendered !== undefined) {
      if (payment.method !== "cash") error ??= "Only cash can have an amount received";
      else if (payment.tendered < payment.amount) error ??= "Cash received can't be less than the amount";
      else change += payment.tendered - payment.amount;
    }
    if (payment.reference && payment.reference.length > 100) error ??= "Keep the reference under 100 characters";
    paid += Number.isSafeInteger(payment.amount) ? payment.amount : 0;
  }
  if (paid > total) error ??= "Payments add up to more than the total";
  return { paid, remaining: Math.max(0, total - paid), change, complete: error === null && paid === total, error };
}
