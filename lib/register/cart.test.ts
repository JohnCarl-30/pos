import { describe, expect, it } from "vitest";
import { addToCart, cartInputs, changeSelection, discountInput, findByCode, isOverStock, searchProducts, setLineDiscount, setQuantity, toRegisterCatalog, type RegisterCatalogRow, type RegisterProduct } from "./cart";

const rows: RegisterCatalogRow[] = [
  {
    id: "p1", name: "Latte", active: true, category_id: "c1", tax_class_id: "t1",
    product_variants: [
      { id: "v2", name: "Large", sku: "LAT-L", barcode: null, price: 520, active: true, sort_order: 1, stock_levels: [{ store_id: "s1", quantity: 3, track: true }] },
      { id: "v1", name: "Small", sku: "LAT-S", barcode: "111", price: 420, active: true, sort_order: 0, stock_levels: [{ store_id: "s1", quantity: 0, track: true }] },
      { id: "v9", name: "Old", sku: "LAT-O", barcode: null, price: 1, active: false, sort_order: 2, stock_levels: [] },
    ],
  },
  {
    id: "p2", name: "Espresso", active: true, category_id: null, tax_class_id: "t2",
    product_variants: [{ id: "v3", name: "Default", sku: "ESP", barcode: null, price: 300, active: true, sort_order: 0, stock_levels: [{ store_id: "s1", quantity: 5, track: false }] }],
  },
  { id: "p3", name: "Gone", active: false, category_id: null, tax_class_id: "t1", product_variants: [] },
];
const rates = [{ tax_class_id: "t1", rate_bps: 825 }];
const products = toRegisterCatalog(rows, "s1", rates);

describe("toRegisterCatalog", () => {
  it("keeps active products and variants with store prices, tax and stock", () => {
    expect(products.map((product) => product.name)).toEqual(["Espresso", "Latte"]);
    expect(products[1].variants.map((variant) => variant.id)).toEqual(["v1", "v2"]);
    expect(products[1].variants[0]).toEqual({ id: "v1", name: "Small", sku: "LAT-S", barcode: "111", price: 420, rateBps: 825, track: true, quantity: 0 });
    expect(products[0].variants[0].rateBps).toBe(0);
  });
});

describe("findByCode and searchProducts", () => {
  it("finds an exact barcode or SKU", () => {
    expect(findByCode(products, "111")?.variant.id).toBe("v1");
    expect(findByCode(products, "esp")?.variant.id).toBe("v3");
    expect(findByCode(products, "lat")).toBeNull();
  });
  it("filters by name, SKU and category", () => {
    expect(searchProducts(products, "lat", "").map((product) => product.id)).toEqual(["p1"]);
    expect(searchProducts(products, "", "c1").map((product) => product.id)).toEqual(["p1"]);
    expect(searchProducts(products, "", "").length).toBe(2);
  });
});

describe("cart lines", () => {
  const latte = products[1];
  it("adds, increments and labels lines", () => {
    let lines = addToCart([], latte, latte.variants[0]);
    lines = addToCart(lines, latte, latte.variants[0]);
    expect(lines).toEqual([
      {
        key: "v1", variantId: "v1", label: "Latte – Small", sku: "LAT-S", basePrice: 420, price: 420, optionIds: [], modifierLabel: "", kitchen: false,
        rateBps: 825, track: true, stock: 0, quantity: 2, discountBps: null, discountAmount: null,
      },
    ]);
    expect(isOverStock(lines[0])).toBe(true);
  });
  it("changes quantity, removes at zero and sets discounts", () => {
    let lines = addToCart([], latte, latte.variants[1]);
    lines = setLineDiscount(lines, "v2", { bps: 1000 });
    expect(cartInputs(lines)).toEqual([{ price: 520, quantity: 1, rateBps: 825, discountBps: 1000, discountAmount: null }]);
    lines = setLineDiscount(lines, "v2", { amount: 50 });
    expect(lines[0]).toMatchObject({ discountBps: null, discountAmount: 50 });
    lines = setQuantity(lines, "v2", 0);
    expect(lines).toEqual([]);
  });
  it("turns a discount into the pricing input", () => {
    expect(discountInput({ bps: 500 })).toEqual({ bps: 500 });
    expect(discountInput({ amount: 25 })).toEqual({ amount: 25 });
    expect(discountInput(null)).toBeNull();
  });
});

describe("modifiers in the cart", () => {
  const latte: RegisterProduct = {
    id: "p1",
    name: "Latte",
    categoryId: "c1",
    kitchen: true,
    modifierGroups: [{ id: "g1", name: "Milk", min: 1, max: 1, options: [{ id: "o1", name: "Whole", priceDelta: 0 }, { id: "o2", name: "Oat", priceDelta: 50 }] }],
    variants: [{ id: "v1", name: "Small", sku: "LAT-S", barcode: null, price: 420, rateBps: 825, track: false, quantity: 0 }],
  };
  it("prices and keys lines by their choices", () => {
    let lines = addToCart([], latte, latte.variants[0], { g1: ["o2"] });
    lines = addToCart(lines, latte, latte.variants[0], { g1: ["o2"] });
    lines = addToCart(lines, latte, latte.variants[0], { g1: ["o1"] });
    expect(lines.map((line) => [line.key, line.price, line.modifierLabel, line.quantity, line.kitchen])).toEqual([
      ["v1|o2", 470, "Oat", 2, true],
      ["v1|o1", 420, "Whole", 1, true],
    ]);
    expect(cartInputs(lines)[0].price).toBe(470);
  });
  it("merges a line into a matching one when its choices change", () => {
    let lines = addToCart([], latte, latte.variants[0], { g1: ["o2"] });
    lines = addToCart(lines, latte, latte.variants[0], { g1: ["o1"] });
    lines = changeSelection(lines, "v1|o1", latte, { g1: ["o2"] });
    expect(lines.map((line) => [line.key, line.quantity])).toEqual([["v1|o2", 2]]);
  });
  it("reads groups and the kitchen flag from the catalog", () => {
    const [product] = toRegisterCatalog(
      [
        {
          id: "p1", name: "Latte", active: true, category_id: "c1", tax_class_id: "t1",
          product_variants: [{ id: "v1", name: "Small", sku: "LAT-S", barcode: null, price: 420, active: true, sort_order: 0, stock_levels: [] }],
          product_modifier_groups: [
            { sort_order: 1, group: { id: "g2", name: "Old", min_choices: 1, max_choices: 1, active: false, modifier_options: [] } },
            { sort_order: 0, group: { id: "g1", name: "Milk", min_choices: 1, max_choices: 1, active: true, modifier_options: [
              { id: "o2", name: "Oat", price_delta: 50, active: true, sort_order: 1 },
              { id: "o1", name: "Whole", price_delta: 0, active: true, sort_order: 0 },
              { id: "o3", name: "Cream", price_delta: 60, active: false, sort_order: 2 },
            ] } },
          ],
        },
      ],
      "s1",
      [],
      new Set(["c1"]),
    );
    expect(product.kitchen).toBe(true);
    expect(product.modifierGroups).toEqual([{ id: "g1", name: "Milk", min: 1, max: 1, options: [{ id: "o1", name: "Whole", priceDelta: 0 }, { id: "o2", name: "Oat", priceDelta: 50 }] }]);
  });
});
