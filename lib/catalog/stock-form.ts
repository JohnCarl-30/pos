export type StockAction =
  | { kind: "received" | "damaged"; variantId: string; quantity: number; note: string | null }
  | { kind: "correction"; variantId: string; change: number; note: string }
  | { kind: "counted"; variantId: string; counted: number; note: string | null }
  | { kind: "transfer"; variantId: string; toStoreId: string; quantity: number; note: string | null };

type Result<T> = ({ ok: true } & T) | { ok: false; fieldErrors: Record<string, string> };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSITIVE = /^[1-9]\d{0,6}$/;
const NON_NEGATIVE = /^\d{1,7}$/;
const SIGNED = /^-?[1-9]\d{0,6}$/;

export function parseStockAction(values: Record<string, string>): Result<{ action: StockAction }> {
  const errors: Record<string, string> = {};
  const variantId = values.variantId ?? "";
  if (!GUID.test(variantId)) errors.variantId = "Pick a variant";
  const noteText = (values.note ?? "").trim();
  if (noteText.length > 300) errors.note = "Keep the note under 300 characters";
  const note = noteText || null;
  const kind = values.kind;

  if (kind === "received" || kind === "damaged" || kind === "transfer") {
    const quantity = (values.quantity ?? "").trim();
    if (!POSITIVE.test(quantity)) errors.quantity = "Enter a whole number above 0";
    if (kind === "transfer" && !GUID.test(values.toStoreId ?? "")) errors.toStoreId = "Pick a store";
    if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
    if (kind === "transfer") return { ok: true, action: { kind, variantId, toStoreId: values.toStoreId, quantity: Number(quantity), note } };
    return { ok: true, action: { kind, variantId, quantity: Number(quantity), note } };
  }
  if (kind === "counted") {
    const counted = (values.counted ?? "").trim();
    if (!NON_NEGATIVE.test(counted)) errors.counted = "Enter a whole number of 0 or more";
    if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
    return { ok: true, action: { kind, variantId, counted: Number(counted), note } };
  }
  if (kind === "correction") {
    const change = (values.change ?? "").trim();
    if (!SIGNED.test(change)) errors.change = "Enter a change like 3 or -2";
    if (!note) errors.note = "Say why you're correcting the count";
    if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
    return { ok: true, action: { kind, variantId, change: Number(change), note: note as string } };
  }
  return { ok: false, fieldErrors: { kind: "Pick what happened" } };
}

export function parseStockSettings(values: Record<string, string>): Result<{ variantId: string; track: boolean; lowStockAt: number | null }> {
  const errors: Record<string, string> = {};
  const variantId = values.variantId ?? "";
  if (!GUID.test(variantId)) errors.variantId = "Pick a variant";
  const low = (values.lowStockAt ?? "").trim();
  if (low !== "" && !NON_NEGATIVE.test(low)) errors.lowStockAt = "Enter a whole number of 0 or more, or leave it empty";
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, variantId, track: values.track === "on", lowStockAt: low === "" ? null : Number(low) };
}
