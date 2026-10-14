import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import ImportPanel from "@/components/products/import-panel";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Import products" };

export default async function ImportProductsPage() {
  await requireRole("manager");
  return (
    <section id="import-products" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Import products" actions={<Button href="/products" variant="ghost" size="md">Back to products</Button>} />
      <ScrollArea className="min-h-0 flex-1">
        <ImportPanel />
      </ScrollArea>
    </section>
  );
}
