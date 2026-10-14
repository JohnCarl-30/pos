import type { Metadata } from "next";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import TaxClasses from "@/components/settings/tax-classes";
import TaxRateRow from "@/components/settings/tax-rate-row";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatBpsAsPercent } from "@/lib/percent";

export const metadata: Metadata = { title: "Tax" };

export default async function TaxSettingsPage() {
  const staff = await requireRole("owner");
  const store = await getCurrentStore(staff);
  const supabase = await createClient();
  const { data: classes } = await supabase.from("tax_classes").select("id, name, is_default").order("name");
  const { data: rates } = store
    ? await supabase.from("tax_rates").select("tax_class_id, name, rate_bps").eq("store_id", store.id)
    : { data: [] };

  return (
    <>
      <TaxClasses classes={classes ?? []} />
      {store && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2>Rates for {store.name}</h2>
            <p className="text-subtle">Switch stores in the sidebar to edit another store&apos;s rates. A class with no rate is charged 0%.</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Label on receipts</TableHead>
                <TableHead>Rate (%)</TableHead>
                <TableHead className="sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(classes ?? []).map((taxClass) => {
                const rate = rates?.find((row) => row.tax_class_id === taxClass.id);
                return (
                  <TaxRateRow
                    key={taxClass.id}
                    storeId={store.id}
                    taxClass={taxClass}
                    rate={rate ? { name: rate.name, rate: formatBpsAsPercent(rate.rate_bps) } : null}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
