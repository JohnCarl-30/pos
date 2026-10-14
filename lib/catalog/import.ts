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
    quantity: number;
  }[];
};

export type ImportRowStatus = "new" | "update" | "unchanged" | "error";

export type ResolvedRow = {
  product: string;
  sku: string;
  price: number;
  category?: string | null;
  variant?: string;
  barcode?: string | null;
  cost?: number | null;
  tax_class_id?: string;
  track?: boolean;
  stock?: number;
};

export type ImportPreview = {
  fileError: string | null;
  rows: { line: number; sku: string; product: string; status: ImportRowStatus; errors: string[]; changes: string[] }[];
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

  const has = (column: Column) => indexOf.has(column);
  const cell = (row: string[], column: Column) => {
    const index = indexOf.get(column);
    const value = index === undefined ? "" : (row[index] ?? "").trim();
    return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
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
    if (has("category")) groupCategory.get(key)!.add(cell(row, "category").toLowerCase());
    if (has("tax_class")) {
      const taxName = cell(row, "tax_class");
      const taxId = taxName === "" ? ctx.defaultTaxClassId : taxByName.get(taxName.toLowerCase());
      if (taxId) groupTax.get(key)!.add(taxId);
    }
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

    const variantName = cell(row, "variant");
    if (!product) errors.push("Product name is required");
    else if (product.length > 120) errors.push("Product name must be 120 characters or fewer");
    if (!sku) errors.push("SKU is required");
    else if (sku.length > 64) errors.push("SKU must be 64 characters or fewer");
    if (variantName.length > 60) errors.push("Variant name must be 60 characters or fewer");
    if (category.length > 60) errors.push("Category must be 60 characters or fewer");
    if (barcode.length > 64) errors.push("Barcode must be 64 characters or fewer");

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
    const existing = sku ? variantsBySku.get(sku) : undefined;
    const parsedStock = stockText === "" ? null : /^-?\d{1,9}$/.test(stockText) ? Number(stockText) : undefined;
    const stock = parsedStock !== null && parsedStock !== undefined && parsedStock < 0 && parsedStock !== existing?.quantity ? undefined : parsedStock;
    if (stock === undefined) errors.push("Stock must be a whole number of 0 or more");
    if (!existing && product && archivedProducts.has(productKey) && !activeProducts.has(productKey)) {
      errors.push(`Product "${product}" is archived — restore it first`);
    }
    const displayName = groupName.get(productKey) ?? product;
    if (product && (groupCategory.get(productKey)?.size ?? 0) > 1) errors.push(`Rows for "${displayName}" disagree on category`);
    if (product && (groupTax.get(productKey)?.size ?? 0) > 1) errors.push(`Rows for "${displayName}" disagree on tax class`);

    if (errors.length > 0) {
      preview.rows.push({ line: index + 2, sku, product, status: "error", errors, changes: [] });
      preview.summary.error += 1;
      return;
    }

    if (has("category") && category && !knownCategories.has(category.toLowerCase())) newCategories.set(category.toLowerCase(), category);

    const resolvedRow: ResolvedRow = { product, sku, price: price as number };
    if (has("category")) resolvedRow.category = category || null;
    if (has("variant") || !existing) resolvedRow.variant = variantName || "Default";
    if (has("barcode")) resolvedRow.barcode = barcode || null;
    if (has("cost")) resolvedRow.cost = cost as number | null;
    if (has("tax_class") || !existing) resolvedRow.tax_class_id = taxClassId as string;
    if (track !== null) resolvedRow.track = track as boolean;
    if (stock !== null && !(existing && stock === existing.quantity)) resolvedRow.stock = stock as number;

    const changes: string[] = [];
    let status: ImportRowStatus = "new";
    if (existing) {
      if (existing.productName !== product) changes.push(`name → ${product}`);
      if (resolvedRow.category !== undefined && (existing.categoryName ?? null) !== resolvedRow.category) changes.push(`category → ${resolvedRow.category ?? "none"}`);
      if (resolvedRow.variant !== undefined && existing.name !== resolvedRow.variant) changes.push(`variant → ${resolvedRow.variant}`);
      if (resolvedRow.barcode !== undefined && (existing.barcode ?? null) !== resolvedRow.barcode) changes.push("barcode");
      if (existing.price !== resolvedRow.price) changes.push("price");
      if (resolvedRow.cost !== undefined && (existing.cost ?? null) !== resolvedRow.cost) changes.push("cost");
      if (resolvedRow.tax_class_id !== undefined && existing.taxClassId !== resolvedRow.tax_class_id) changes.push("tax class");
      if (resolvedRow.track !== undefined && resolvedRow.track !== existing.track) changes.push(resolvedRow.track ? "start tracking" : "stop tracking");
      if (resolvedRow.stock !== undefined && resolvedRow.stock !== existing.quantity) changes.push(`stock ${existing.quantity} → ${resolvedRow.stock}`);
      status = changes.length === 0 ? "unchanged" : "update";
    }

    preview.rows.push({ line: index + 2, sku, product, status, errors: [], changes });
    preview.summary[status] += 1;
    resolved.push({ row: resolvedRow, status });
  });

  if (preview.summary.error === 0) {
    preview.apply = resolved.filter((entry) => entry.status !== "unchanged").map((entry) => entry.row);
  }
  preview.newCategories = [...newCategories.values()];
  return preview;
}
