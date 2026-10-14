export function currencyDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

export function formatMoney(
  minor: number,
  currency: string,
  locale?: string,
): string {
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    minor / 10 ** digits,
  );
}

function validGrouping(whole: string): boolean {
  const groups = whole.split(/[.,]/);
  if (groups.length === 1) return /^\d*$/.test(whole);
  const [first, ...rest] = groups;
  return (
    /^[1-9]\d{0,2}$/.test(first) && rest.every((group) => /^\d{3}$/.test(group))
  );
}

export function parseMoney(input: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const trimmed = input.trim();

  const stripped = trimmed.replace(/^[^\d.,\-]+/, "").replace(/[^\d.,\-]+$/, "");
  const negative = stripped.startsWith("-");
  const minusCount = (stripped.match(/-/g) || []).length;
  if (minusCount > 1) return null;

  const body = stripped.replace(/^-/, "");
  if (!/\d/.test(body)) return null;

  const invalidCharsMatch = body.match(/[^\d.,]/);
  if (invalidCharsMatch) return null;

  const lastDot = body.lastIndexOf(".");
  const lastComma = body.lastIndexOf(",");
  const lastSeparator = Math.max(lastDot, lastComma);

  let tail = "";
  let tailIsDecimal = false;

  if (lastSeparator !== -1) {
    tail = body.slice(lastSeparator + 1);

    if (digits === 3) {
      tailIsDecimal = lastDot === lastSeparator && tail.length <= digits;
    } else {
      tailIsDecimal = tail.length <= digits && digits > 0;
    }
  }

  const whole = tailIsDecimal ? body.slice(0, lastSeparator) : body;
  const fraction = tailIsDecimal ? tail : "";
  if (!validGrouping(whole)) return null;

  const value =
    Number(whole.replace(/[.,]/g, "") || "0") * 10 ** digits +
    Number(fraction.padEnd(digits, "0") || "0");
  return negative && value !== 0 ? -value : value;
}
