import { describe, expect, it } from "vitest";
import { buildImportContext } from "./import-context";

describe("buildImportContext", () => {
  it("flattens database rows for validation", () => {
    const ctx = buildImportContext(
      {
        taxClasses: [{ id: "t1", name: "Standard", is_default: true }, { id: "t2", name: "Exempt", is_default: false }],
        categories: [{ name: "Coffee" }],
        products: [{ name: "Latte", active: true }],
        variants: [
          {
            sku: "LAT-S", name: "Small", barcode: null, price: 420, cost: null,
            product: { name: "Latte", tax_class_id: "t1", category: { name: "Coffee" } },
            stock_levels: [{ store_id: "s1", track: false, quantity: 4 }, { store_id: "s2", track: true, quantity: 9 }],
          },
        ],
      },
      "s1",
      "USD",
    );
    expect(ctx).toEqual({
      currency: "USD",
      defaultTaxClassId: "t1",
      taxClasses: [{ id: "t1", name: "Standard" }, { id: "t2", name: "Exempt" }],
      categories: [{ name: "Coffee" }],
      products: [{ name: "Latte", active: true }],
      variants: [{ sku: "LAT-S", name: "Small", barcode: null, price: 420, cost: null, track: false, productName: "Latte", categoryName: "Coffee", taxClassId: "t1", quantity: 4 }],
    });
  });
});
