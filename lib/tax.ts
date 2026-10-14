export type LineInput = {
  unitPrice: number;
  quantity: number;
  discount: number;
  rateBps: number;
  pricesIncludeTax: boolean;
};

export type LineTotals = { net: number; tax: number; gross: number };

const BPS = 10_000n;

export function divRoundHalfEven(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator - quotient * denominator;
  const twice = remainder * 2n;
  if (twice > denominator) return quotient + 1n;
  if (twice < denominator) return quotient;
  return quotient % 2n === 0n ? quotient : quotient + 1n;
}

function assertInteger(name: string, value: number, min: number) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`${name} must be an integer ≥ ${min}`);
  }
}

export function calculateLine(input: LineInput): LineTotals {
  assertInteger("unitPrice", input.unitPrice, 0);
  assertInteger("quantity", input.quantity, 1);
  assertInteger("discount", input.discount, 0);
  assertInteger("rateBps", input.rateBps, 0);

  const amount = input.unitPrice * input.quantity - input.discount;
  if (amount < 0) throw new RangeError("discount exceeds line amount");

  const rate = BigInt(input.rateBps);
  if (input.pricesIncludeTax) {
    const net = Number(divRoundHalfEven(BigInt(amount) * BPS, BPS + rate));
    return { net, tax: amount - net, gross: amount };
  }
  const tax = Number(divRoundHalfEven(BigInt(amount) * rate, BPS));
  return { net: amount, tax, gross: amount + tax };
}

export function sumLines(lines: LineTotals[]): LineTotals {
  return lines.reduce(
    (total, line) => ({
      net: total.net + line.net,
      tax: total.tax + line.tax,
      gross: total.gross + line.gross,
    }),
    { net: 0, tax: 0, gross: 0 },
  );
}
