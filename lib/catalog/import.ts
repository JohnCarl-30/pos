import { parseMoney } from "@/lib/money";

export const IMPORT_COLUMNS = ["product", "category", "variant", "sku", "barcode", "price", "cost", "tax_class", "track", "stock"] as const;
export const MAX_IMPORT_ROWS = 5000;

type Column = (typeof IMPORT_COLUMNS)[number];

export type ImportContext = {
  currency: string;
  defaultTaxClassId: string;
  taxClasses: { id: string; name: string }[];
  categories: { name: string }[];
  products: { name: string; active: boolean }[];
  variants: {
    sku: string;
    name: string;
    barcode: string | null;
    price: number;
    cost: number | null;
    track: boolean;
    productName: string;
    categoryName: string | null;
    taxClassId: string;
  }[];
};

export type ImportRowStatus = "new" | "update" | "unchanged" | "error";

export type ResolvedRow = {
  product: string;
  category: string | null;
  variant: string;
  sku: string;
  barcode: string | null;
  price: number;
  cost: number | null;
  tax_class_id: string;
  track: boolean | null;
  stock: number | null;
};

export type ImportPreview = {
  fileError: string | null;
  rows: { line: number; sku: string; product: string; status: ImportRowStatus; errors: string[] }[];
  summary: Record<ImportRowStatus, number>;
  newCategories: string[];
  apply: ResolvedRow[];
};

const REQUIRED: Column[] = ["product", "sku", "price"];
const TRUE_VALUES = ["yes", "true", "1", "y"];
const FALSE_VALUES = ["no", "false", "0", "n"];

function emptyPreview(fileError: string): ImportPreview {
  return { fileError, rows: [], summary: { new: 0, update: 0, unchanged: 0, error: 0 }, newCategories: [], apply: [] };
}

function parseTrack(value: string): boolean | null | undefined {
  if (value === "") return null;
  const lower = value.toLowerCase();
  if (TRUE_VALUES.includes(lower)) return true;
  if (FALSE_VALUES.includes(lower)) return false;
  return undefined;
}

export function validateImport(header: string[], rows: string[][], ctx: ImportContext): ImportPreview {
  const indexOf = new Map<string, number>();
  header.forEach((name, index) => indexOf.set(name.trim().toLowerCase(), index));
  const missing = REQUIRED.filter((column) => !indexOf.has(column));
  if (missing.length > 0) return emptyPreview(`Missing columns: ${missing.join(", ")}`);
  if (rows.length > MAX_IMPORT_ROWS) return emptyPreview(`The file has ${rows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`);

  const cell = (row: string[], column: Column) => {
    const index = indexOf.get(column);
    return index === undefined ? "" : (row[index] ?? "").trim();
  };

  const variantsBySku = new Map(ctx.variants.map((variant) => [variant.sku, variant]));
  const skuByBarcode = new Map(ctx.variants.filter((variant) => variant.barcode).map((variant) => [variant.barcode as string, variant.sku]));
  const taxByName = new Map(ctx.taxClasses.map((taxClass) => [taxClass.name.toLowerCase(), taxClass.id]));
  const activeProducts = new Set(ctx.products.filter((product) => product.active).map((product) => product.name.toLowerCase()));
  const archivedProducts = new Set(ctx.products.filter((product) => !product.active).map((product) => product.name.toLowerCase()));
  const knownCategories = new Set(ctx.categories.map((category) => category.name.toLowerCase()));

  const skuCounts = new Map<string, number>();
  const barcodeCounts = new Map<string, number>();
  for (const row of rows) {
    const sku = cell(row, "sku");
    const barcode = cell(row, "barcode");
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
    if (barcode) barcodeCounts.set(barcode, (barcodeCounts.get(barcode) ?? 0) + 1);
  }

  const groupName = new Map<string, string>();
  const groupCategory = new Map<string, Set<string>>();
  const groupTax = new Map<string, Set<string>>();
  for (const row of rows) {
    const product = cell(row, "product");
    const key = product.toLowerCase();
    if (!key) continue;
    if (!groupName.has(key)) groupName.set(key, product);
    if (!groupCategory.has(key)) groupCategory.set(key, new Set());
    if (!groupTax.has(key)) groupTax.set(key, new Set());
    groupCategory.get(key)!.add(cell(row, "category").toLowerCase());
    const taxName = cell(row, "tax_class");
    const taxId = taxName === "" ? ctx.defaultTaxClassId : taxByName.get(taxName.toLowerCase());
    if (taxId) groupTax.get(key)!.add(taxId);
  }

  const preview: ImportPreview = { fileError: null, rows: [], summary: { new: 0, update: 0, unchanged: 0, error: 0 }, newCategories: [], apply: [] };
  const newCategories = new Map<string, string>();
  const resolved: { row: ResolvedRow; status: ImportRowStatus }[] = [];

  rows.forEach((row, index) => {
    const errors: string[] = [];
    const product = cell(row, "product");
    const sku = cell(row, "sku");
    const barcode = cell(row, "barcode");
    const category = cell(row, "category");
    const taxName = cell(row, "tax_class");
    const productKey = product.toLowerCase();

    if (!product) errors.push("Product name is required");
    if (!sku) errors.push("SKU is required");

    const price = parseMoney(cell(row, "price"), ctx.currency);
    if (price === null || price < 0) errors.push("Price must be an amount like 4.50");

    const costText = cell(row, "cost");
    const cost = costText === "" ? null : parseMoney(costText, ctx.currency);
    if (costText !== "" && (cost === null || cost < 0)) errors.push("Cost must be an amount like 1.20");

    const taxClassId = taxName === "" ? ctx.defaultTaxClassId : taxByName.get(taxName.toLowerCase());
    if (!taxClassId) errors.push(`Unknown tax class "${taxName}"`);

    if (sku && (skuCounts.get(sku) ?? 0) > 1) errors.push(`SKU ${sku} appears more than once in the file`);
    if (barcode && (barcodeCounts.get(barcode) ?? 0) > 1) errors.push(`Barcode ${barcode} appears more than once in the file`);
    const barcodeOwner = barcode ? skuByBarcode.get(barcode) : undefined;
    if (barcodeOwner && barcodeOwner !== sku) errors.push(`Barcode ${barcode} is already used by ${barcodeOwner}`);

    const track = parseTrack(cell(row, "track"));
    if (track === undefined) errors.push("Track must be yes or no");

    const stockText = cell(row, "stock");
    const stock = stockText === "" ? null : /^\d+$/.test(stockText) ? Number(stockText) : undefined;
    if (stock === undefined) errors.push("Stock must be a whole number of 0 or more");

    const existing = sku ? variantsBySku.get(sku) : undefined;
    if (!existing && product && archivedProducts.has(productKey) && !activeProducts.has(productKey)) {
      errors.push(`Product "${product}" is archived — restore it first`);
    }
    const displayName = groupName.get(productKey) ?? product;
    if (product && (groupCategory.get(productKey)?.size ?? 0) > 1) errors.push(`Rows for "${displayName}" disagree on category`);
    if (product && (groupTax.get(productKey)?.size ?? 0) > 1) errors.push(`Rows for "${displayName}" disagree on tax class`);

    if (errors.length > 0) {
      preview.rows.push({ line: index + 2, sku, product, status: "error", errors });
      preview.summary.error += 1;
      return;
    }

    if (category && !knownCategories.has(category.toLowerCase())) newCategories.set(category.toLowerCase(), category);

    const resolvedRow: ResolvedRow = {
      product,
      category: category || null,
      variant: cell(row, "variant") || "Default",
      sku,
      barcode: barcode || null,
      price: price as number,
      cost: cost as number | null,
      tax_class_id: taxClassId as string,
      track: track as boolean | null,
      stock: stock as number | null,
    };

    let status: ImportRowStatus = "new";
    if (existing) {
      const same =
        existing.productName === resolvedRow.product &&
        (existing.categoryName ?? null) === resolvedRow.category &&
        existing.name === resolvedRow.variant &&
        (existing.barcode ?? null) === resolvedRow.barcode &&
        existing.price === resolvedRow.price &&
        (existing.cost ?? null) === resolvedRow.cost &&
        existing.taxClassId === resolvedRow.tax_class_id &&
        (resolvedRow.track === null || resolvedRow.track === existing.track) &&
        resolvedRow.stock === null;
      status = same ? "unchanged" : "update";
    }

    preview.rows.push({ line: index + 2, sku, product, status, errors: [] });
    preview.summary[status] += 1;
    resolved.push({ row: resolvedRow, status });
  });

  if (preview.summary.error === 0) {
    preview.apply = resolved.filter((entry) => entry.status !== "unchanged").map((entry) => entry.row);
  }
  preview.newCategories = [...newCategories.values()];
  return preview;
}
