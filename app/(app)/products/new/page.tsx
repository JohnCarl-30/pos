import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import { ScrollArea } from "@/components/_ui/scroll-area";
import ProductForm from "@/components/products/product-form";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { loadCategories } from "@/lib/catalog/queries";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  const supabase = await createClient();
  const [categories, { data: taxClasses }] = await Promise.all([
    loadCategories(supabase),
    supabase.from("tax_classes").select("id, name, is_default").order("name"),
  ]);
  const defaultTax = taxClasses?.find((taxClass) => taxClass.is_default)?.id ?? taxClasses?.[0]?.id ?? "";

  return (
    <section id="new-product" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="New product" />
      <ScrollArea className="min-h-0 flex-1">
        <ProductForm
          initial={{ name: "", categoryId: "", taxClassId: defaultTax, description: "", active: true, variants: [{ name: "Default", sku: "", barcode: "", price: "", cost: "", track: true, active: true }] }}
          categories={categories}
          taxClasses={taxClasses ?? []}
          currency={store?.currency ?? "USD"}
        />
      </ScrollArea>
    </section>
  );
}
