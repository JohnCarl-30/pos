import { describe, expect, it } from "vitest";
import { parseProductForm, type ProductFormInput } from "./product-form";

const base: ProductFormInput = {
  name: "Latte",
  categoryId: "",
  taxClassId: "00000000-0000-4000-8000-000000000001",
  description: "",
  active: true,
  variants: [
    { name: "Small", sku: "LAT-S", barcode: "", price: "4,20", cost: "", track: true, active: true },
    { name: "Large", sku: "LAT-L", barcode: "222", price: "5.20", cost: "1.40", track: false, active: true },
  ],
};

describe("parseProductForm", () => {
  it("builds the save payload in minor units with sort order", () => {
    const result = parseProductForm(base, "EUR");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product).toEqual({ name: "Latte", category_id: null, tax_class_id: base.taxClassId, description: null, active: true });
    expect(result.variants).toEqual([
      { name: "Small", sku: "LAT-S", barcode: null, price: 420, cost: null, track: true, active: true, sort_order: 0 },
      { name: "Large", sku: "LAT-L", barcode: "222", price: 520, cost: 140, track: false, active: true, sort_order: 1 },
    ]);
  });

  it("keeps ids for existing records", () => {
    const result = parseProductForm(
      { ...base, id: "00000000-0000-4000-8000-0000000000aa", variants: [{ ...base.variants[0], id: "00000000-0000-4000-8000-0000000000bb" }] },
      "EUR",
    );
    expect(result.ok && result.product.id).toBe("00000000-0000-4000-8000-0000000000aa");
    expect(result.ok && result.variants[0].id).toBe("00000000-0000-4000-8000-0000000000bb");
  });

  it("names the row with a bad price or a duplicate SKU", () => {
    const result = parseProductForm(
      { ...base, variants: [base.variants[0], { ...base.variants[1], sku: "LAT-S", price: "abc" }] },
      "EUR",
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        "variants.1.price": "Enter a price like 4.50",
        "variants.1.sku": "This SKU is already used on another row",
      },
    });
  });

  it("flags duplicate barcodes", () => {
    const result = parseProductForm({ ...base, variants: [{ ...base.variants[0], barcode: "9" }, { ...base.variants[1], barcode: "9" }] }, "EUR");
    expect(result.ok ? null : result.fieldErrors["variants.1.barcode"]).toBe("This barcode is already used on another row");
  });

  it("requires a name and at least one active variant", () => {
    const result = parseProductForm({ ...base, name: " ", variants: [{ ...base.variants[0], active: false }] }, "EUR");
    expect(result).toEqual({
      ok: false,
      fieldErrors: { name: "Enter a product name", variants: "Keep at least one active variant" },
    });
  });
  it("passes modifier groups through only when the form has them", () => {
    const group = "00000000-0000-4000-8000-0000000000cc";
    const withGroups = parseProductForm({ ...base, modifierGroupIds: [group, "bad"] }, "EUR");
    expect(withGroups.ok && withGroups.product.modifier_group_ids).toEqual([group]);
    const without = parseProductForm(base, "EUR");
    expect(without.ok && "modifier_group_ids" in without.product).toBe(false);
  });
});
