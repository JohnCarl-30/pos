import type { ReactNode } from "react";
import Sidebar from "@/components/_common/sidebar/sidebar";
import OfflineBanner from "@/components/_common/offline-banner";
import CommandMenu from "@/components/_common/command-menu";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  const supabase = await createClient();
  const { data: business } = await supabase.from("business").select("name").maybeSingle();

  return (
    <main className="flex h-dvh max-w-full overflow-hidden">
      <Sidebar
        businessName={business?.name ?? "POS"}
        staffName={staff.name}
        role={staff.role}
        stores={staff.stores}
        currentStoreId={store?.id ?? null}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <OfflineBanner />
        {children}
      </div>
      <CommandMenu role={staff.role} />
    </main>
  );
}
