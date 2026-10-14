import type { ReactNode } from "react";
import PageHeader from "@/components/_common/page-header";
import SettingsNav from "@/components/settings/settings-nav";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { requireRole } from "@/lib/auth/staff";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireRole("owner");
  return (
    <section id="settings" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Settings" />
      <SettingsNav />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-6 p-4">{children}</div>
      </ScrollArea>
    </section>
  );
}
