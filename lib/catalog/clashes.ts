import type { SaveVariantPayload } from "./product-form";

type Existing = { id: string; sku: string; barcode: string | null; productName: string };

export function clashErrors(variants: SaveVariantPayload[], existing: Existing[]): Record<string, string> {
  const errors: Record<string, string> = {};
  variants.forEach((variant, index) => {
    const skuOwner = existing.find((row) => row.sku.toLowerCase() === variant.sku.toLowerCase() && row.id !== variant.id);
    if (skuOwner) errors[`variants.${index}.sku`] = `Already used by ${skuOwner.productName}`;
    const barcodeOwner = variant.barcode ? existing.find((row) => row.barcode === variant.barcode && row.id !== variant.id) : undefined;
    if (barcodeOwner) errors[`variants.${index}.barcode`] = `Already used by ${barcodeOwner.productName}`;
  });
  return errors;
}
