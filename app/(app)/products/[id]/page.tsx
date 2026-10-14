import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PageHeader from "@/components/_common/page-header";
import { ScrollArea } from "@/components/_ui/scroll-area";
import ProductForm from "@/components/products/product-form";
import ProductTabs from "@/components/products/product-tabs";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { loadCategories } from "@/lib/catalog/queries";
import { toProductFormInput } from "@/lib/catalog/product-input";
import StockPanel from "@/components/products/stock-panel";
import type { StockReason } from "@/lib/catalog/history";

export const metadata: Metadata = { title: "Product" };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProductPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  const { id } = await params;
  const { tab } = await searchParams;
  if (!GUID.test(id) || !store) notFound();

  const supabase = await createClient();
  const [{ data: product }, { data: variants }, categories, { data: taxClasses }] = await Promise.all([
    supabase.from("products").select("id, name, description, active, category_id, tax_class_id").eq("id", id).maybeSingle(),
    supabase.from("product_variants").select("id, name, sku, barcode, price, cost, active, sort_order, stock_levels(store_id, quantity, track, low_stock_at)").eq("product_id", id).order("sort_order"),
    loadCategories(supabase),
    supabase.from("tax_classes").select("id, name").order("name"),
  ]);
  if (!product) notFound();

  const current = tab === "stock" ? "stock" : "details";
  const formKey = (variants ?? []).map((variant) => variant.id).join(",");
  const variantIds = (variants ?? []).map((variant) => variant.id);
  const { data: movements } =
    current === "stock" && variantIds.length > 0
      ? await supabase
          .from("stock_movements")
          .select("id, variant_id, quantity_change, reason, note, created_at, staff:staff(name)")
          .eq("store_id", store.id)
          .in("variant_id", variantIds)
          .order("created_at", { ascending: false })
          .limit(200)
      : { data: [] };
  const { data: storeRow } = await supabase.from("stores").select("timezone").eq("id", store.id).maybeSingle();
  const stockVariants = (variants ?? []).map((variant) => {
    const level = variant.stock_levels.find((entry) => entry.store_id === store.id);
    return {
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      active: variant.active,
      quantity: level?.quantity ?? 0,
      track: level?.track ?? true,
      lowStockAt: level?.low_stock_at ?? null,
    };
  });

  return (
    <section id="product" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title={product.name} />
      <ProductTabs productId={product.id} current={current} />
      <ScrollArea className="min-h-0 flex-1">
        {current === "details" && (
          <ProductForm
            key={formKey}
            initial={toProductFormInput(product, variants ?? [], store.id, store.currency)}
            categories={categories}
            taxClasses={taxClasses ?? []}
            currency={store.currency}
          />
        )}
        {current === "stock" && (
          <StockPanel
            variants={stockVariants}
            movements={(movements ?? []) as unknown as { id: string; variant_id: string; quantity_change: number; reason: StockReason; note: string | null; created_at: string; staff: { name: string } | null }[]}
            otherStores={staff.stores.filter((entry) => entry.id !== store.id).map((entry) => ({ id: entry.id, name: entry.name }))}
            timeZone={storeRow?.timezone ?? "UTC"}
          />
        )}
      </ScrollArea>
    </section>
  );
}
