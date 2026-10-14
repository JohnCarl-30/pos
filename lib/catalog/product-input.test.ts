import { describe, expect, it } from "vitest";
import { productFormInputSchema, toProductFormInput } from "./product-input";

describe("productFormInputSchema", () => {
  it("accepts a well-formed payload", () => {
    const input = { name: "Tea", categoryId: "", taxClassId: "t", description: "", active: true, variants: [{ name: "", sku: "T", barcode: "", price: "1", cost: "", track: true, active: true }] };
    expect(productFormInputSchema.safeParse(input).success).toBe(true);
  });
  it("rejects a malformed payload", () => {
    expect(productFormInputSchema.safeParse({ name: "Tea", variants: "nope" }).success).toBe(false);
    expect(productFormInputSchema.safeParse({ name: "Tea", categoryId: "", taxClassId: "t", description: "", active: true, variants: Array.from({ length: 101 }, () => ({ name: "", sku: "x", barcode: "", price: "1", cost: "", track: true, active: true })) }).success).toBe(false);
  });
});

describe("toProductFormInput", () => {
  it("turns database rows into editable strings for the current store", () => {
    const input = toProductFormInput(
      { id: "p1", name: "Latte", description: null, active: true, category_id: null, tax_class_id: "t1" },
      [
        { id: "v2", name: "Large", sku: "LAT-L", barcode: null, price: 520, cost: null, active: true, sort_order: 1, stock_levels: [{ store_id: "s1", track: false }] },
        { id: "v1", name: "Small", sku: "LAT-S", barcode: "111", price: 420, cost: 110, active: true, sort_order: 0, stock_levels: [{ store_id: "s1", track: true }] },
      ],
      "s1",
      "USD",
    );
    expect(input).toEqual({
      id: "p1", name: "Latte", categoryId: "", taxClassId: "t1", description: "", active: true,
      variants: [
        { id: "v1", name: "Small", sku: "LAT-S", barcode: "111", price: "4.20", cost: "1.10", track: true, active: true },
        { id: "v2", name: "Large", sku: "LAT-L", barcode: "", price: "5.20", cost: "", track: false, active: true },
      ],
    });
  });
});
