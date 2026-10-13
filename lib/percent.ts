export function parsePercentToBps(input: string): number | null {
  const cleaned = input.trim().replace(/%$/, "").trim().replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return bps <= 100_000 ? bps : null;
}
