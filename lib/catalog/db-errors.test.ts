import { describe, expect, it } from "vitest";
import { catalogDbError } from "./db-errors";

describe("catalogDbError", () => {
  it("names SKU and barcode clashes", () => {
    expect(catalogDbError({ code: "23505", message: 'duplicate key value violates unique constraint "product_variants_sku_key"' })).toBe("That SKU is already used by another product.");
    expect(catalogDbError({ code: "23505", message: 'duplicate key value violates unique constraint "product_variants_barcode_key"' })).toBe("That barcode is already used by another product.");
    expect(catalogDbError({ code: "23505", message: 'duplicate key value violates unique constraint "categories_name_key"' })).toBe("A category with that name already exists.");
  });
  it("explains missing records and falls back otherwise", () => {
    expect(catalogDbError({ code: "P0002" })).toBe("That item no longer exists. Reload the page and try again.");
    expect(catalogDbError({ code: "42501" })).toBe("You don't have access to this.");
  });
});
