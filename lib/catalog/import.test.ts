import { describe, expect, it } from "vitest";
import { validateImport, type ImportContext } from "./import";

const ctx: ImportContext = {
  currency: "EUR",
  defaultTaxClassId: "t-std",
  taxClasses: [
    { id: "t-std", name: "Standard" },
    { id: "t-ex", name: "Exempt" },
  ],
  categories: [{ name: "Coffee" }],
  products: [
    { name: "Latte", active: true },
    { name: "Old Muffin", active: false },
  ],
  variants: [
    { sku: "LAT-S", name: "Small", barcode: "111", price: 420, cost: 110, track: true, productName: "Latte", categoryName: "Coffee", taxClassId: "t-std", quantity: 7 },
  ],
};

const header = ["product", "category", "variant", "sku", "barcode", "price", "cost", "tax_class", "track", "stock"];

describe("validateImport", () => {
  it("classifies new, updated and unchanged rows", () => {
    const preview = validateImport(header, [
      ["Latte", "Coffee", "Small", "LAT-S", "111", "4,20", "1,10", "Standard", "yes", ""],
      ["Latte", "Coffee", "Large", "LAT-L", "", "5,20", "", "", "", "8"],
      ["Croissant", "Bakery", "", "CRO", "", "3,50", "", "", "", ""],
    ], ctx);
    expect(preview.fileError).toBeNull();
    expect(preview.rows.map((row) => row.status)).toEqual(["unchanged", "new", "new"]);
    expect(preview.summary).toEqual({ new: 2, update: 0, unchanged: 1, error: 0 });
    expect(preview.newCategories).toEqual(["Bakery"]);
    expect(preview.apply).toHaveLength(2);
    expect(preview.apply[0]).toMatchObject({ sku: "LAT-L", price: 520, stock: 8, tax_class_id: "t-std" });
    expect(preview.apply[1]).toMatchObject({ sku: "CRO", variant: "Default", price: 350 });
  });

  it("marks a changed price as an update", () => {
    const preview = validateImport(header, [["Latte", "Coffee", "Small", "LAT-S", "111", "4,50", "1,10", "Standard", "yes", ""]], ctx);
    expect(preview.rows[0].status).toBe("update");
    expect(preview.apply[0].price).toBe(450);
  });

  it("reports each kind of row error", () => {
    const preview = validateImport(header, [
      ["", "", "", "NOPROD", "", "1", "", "", "", ""],
      ["Tea", "", "", "", "", "1", "", "", "", ""],
      ["Tea", "", "", "T1", "", "abc", "", "", "", ""],
      ["Tea", "", "", "T2", "", "1", "", "Luxury", "", ""],
      ["Tea", "", "", "T3", "111", "1", "", "", "", ""],
      ["Tea", "", "", "T4", "", "1", "", "", "maybe", "-2"],
      ["Old Muffin", "", "", "OM1", "", "1", "", "", "", ""],
    ], ctx);
    expect(preview.rows.map((row) => row.errors)).toEqual([
      ["Product name is required"],
      ["SKU is required"],
      ["Price must be an amount like 4.50"],
      ["Unknown tax class \"Luxury\""],
      ["Barcode 111 is already used by LAT-S"],
      ["Track must be yes or no", "Stock must be a whole number of 0 or more"],
      ["Product \"Old Muffin\" is archived — restore it first"],
    ]);
    expect(preview.summary.error).toBe(7);
    expect(preview.apply).toEqual([]);
  });

  it("flags duplicate SKUs and barcodes within the file", () => {
    const preview = validateImport(header, [
      ["Bagel", "", "", "BAG", "900", "3", "", "", "", ""],
      ["Bagel", "", "Seeded", "BAG", "900", "3", "", "", "", ""],
    ], ctx);
    expect(preview.rows[1].errors).toEqual(["SKU BAG appears more than once in the file", "Barcode 900 appears more than once in the file"]);
  });

  it("flags rows of one product that disagree on category", () => {
    const preview = validateImport(header, [
      ["Bagel", "Bakery", "", "B1", "", "3", "", "", "", ""],
      ["bagel", "Snacks", "Seeded", "B2", "", "3", "", "", "", ""],
    ], ctx);
    expect(preview.rows.map((row) => row.errors)).toEqual([
      ["Rows for \"Bagel\" disagree on category"],
      ["Rows for \"Bagel\" disagree on category"],
    ]);
  });

  it("rejects a file without the required columns", () => {
    expect(validateImport(["name", "cost"], [["x", "1"]], ctx).fileError).toBe("Missing columns: product, sku, price");
  });

  it("rejects a file that is too long", () => {
    const rows = Array.from({ length: 5001 }, (_, index) => ["P", "", "", `S${index}`, "", "1", "", "", "", ""]);
    expect(validateImport(header, rows, ctx).fileError).toBe("The file has 5001 rows. Import at most 5000 at a time.");
  });

  it("matches headers case-insensitively and accepts missing optional columns", () => {
    const preview = validateImport(["Product", "SKU", "Price"], [["Scone", "SC", "2"]], ctx);
    expect(preview.apply[0]).toEqual({ product: "Scone", variant: "Default", sku: "SC", price: 200, tax_class_id: "t-std" });
  });

  it("only touches the columns a file has for existing SKUs", () => {
    const preview = validateImport(["product", "sku", "price"], [["Latte", "LAT-S", "4,50"]], ctx);
    expect(preview.rows[0]).toMatchObject({ status: "update", changes: ["price"] });
    expect(preview.apply[0]).toEqual({ product: "Latte", sku: "LAT-S", price: 450 });
  });

  it("treats an unchanged stock count as no change and shows a stock change", () => {
    const same = validateImport(["product", "sku", "price", "stock"], [["Latte", "LAT-S", "4,20", "7"]], ctx);
    expect(same.rows[0].status).toBe("unchanged");
    const changed = validateImport(["product", "sku", "price", "stock"], [["Latte", "LAT-S", "4,20", "5"]], ctx);
    expect(changed.rows[0]).toMatchObject({ status: "update", changes: ["stock 7 → 5"] });
  });

  it("strips the formula guard that export adds", () => {
    const preview = validateImport(["product", "sku", "price"], [["'=Odd", "'-100", "1"]], ctx);
    expect(preview.apply[0]).toMatchObject({ product: "=Odd", sku: "-100" });
  });

  it("rejects values longer than the database allows", () => {
    const preview = validateImport(["product", "sku", "price", "barcode"], [["P", "S".repeat(65), "1", "B".repeat(65)]], ctx);
    expect(preview.rows[0].errors).toEqual(["SKU must be 64 characters or fewer", "Barcode must be 64 characters or fewer"]);
  });

  it("accepts an exported negative count when it hasn't changed", () => {
    const negative = { ...ctx, variants: [{ ...ctx.variants[0], quantity: -2 }] };
    expect(validateImport(["product", "sku", "price", "stock"], [["Latte", "LAT-S", "4,20", "-2"]], negative).rows[0].status).toBe("unchanged");
    expect(validateImport(["product", "sku", "price", "stock"], [["Latte", "LAT-S", "4,20", "-3"]], negative).rows[0].errors).toEqual(["Stock must be a whole number of 0 or more"]);
  });
});
