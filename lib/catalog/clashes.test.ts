import { describe, expect, it } from "vitest";
import { clashErrors } from "./clashes";

const variant = (overrides: object) => ({ name: "Default", sku: "A", barcode: null, price: 1, cost: null, track: true, active: true, sort_order: 0, ...overrides });

describe("clashErrors", () => {
  it("names the row whose SKU or barcode belongs to another product", () => {
    expect(
      clashErrors(
        [variant({ sku: "NEW" }), variant({ sku: "LAT-S", barcode: "999" })],
        [
          { id: "v1", sku: "LAT-S", barcode: "111", productName: "Latte" },
          { id: "v9", sku: "MUG", barcode: "999", productName: "Mug" },
        ],
      ),
    ).toEqual({
      "variants.1.sku": "Already used by Latte",
      "variants.1.barcode": "Already used by Mug",
    });
  });
  it("ignores a row's own saved values", () => {
    expect(clashErrors([variant({ id: "v1", sku: "LAT-S", barcode: "111" })], [{ id: "v1", sku: "LAT-S", barcode: "111", productName: "Latte" }])).toEqual({});
  });
});
