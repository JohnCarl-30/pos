const currencies = new Set(Intl.supportedValuesOf("currency"));
const timeZones = new Set(Intl.supportedValuesOf("timeZone"));

export function isCurrencyCode(code: string): boolean {
  return currencies.has(code);
}

export function isTimeZone(zone: string): boolean {
  return zone === "UTC" || timeZones.has(zone);
}
