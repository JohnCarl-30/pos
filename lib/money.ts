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
  const negative = trimmed.startsWith("-");
  const body = trimmed.replace(/^-/, "").replace(/[^\d.,]/g, "");
  if (!/\d/.test(body)) return null;

  const lastSeparator = Math.max(body.lastIndexOf("."), body.lastIndexOf(","));
  const tail = lastSeparator === -1 ? "" : body.slice(lastSeparator + 1);
  const tailIsDecimal =
    lastSeparator !== -1 && digits > 0 && tail.length <= digits;

  const whole = tailIsDecimal ? body.slice(0, lastSeparator) : body;
  const fraction = tailIsDecimal ? tail : "";
  if (!validGrouping(whole)) return null;

  const value =
    Number(whole.replace(/[.,]/g, "") || "0") * 10 ** digits +
    Number(fraction.padEnd(digits, "0") || "0");
  return negative && value !== 0 ? -value : value;
}
