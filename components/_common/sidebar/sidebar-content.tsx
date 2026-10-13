"use client";

import { usePathname } from "next/navigation";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import SidebarNavItem from "./sidebar-nav-item";
import SidebarSection from "./sidebar-section";
import StoreSwitcher from "./store-switcher";
import { NAV_ICONS } from "./nav-icons";
import { navItemsFor } from "@/lib/nav";
import { signOut } from "@/lib/auth/actions";
import type { StaffRole } from "@/lib/auth/roles";
import type { StaffStore } from "@/lib/auth/pick-store";
import Logo from "@/public/assets/images/_common/logo.svg";
import LogOutIcon from "@/public/assets/images/_common/nav/log-out.svg";

export type SidebarProps = {
  businessName: string;
  staffName: string;
  role: StaffRole;
  stores: StaffStore[];
  currentStoreId: string | null;
};

export default function SidebarContent({ businessName, staffName, role, stores, currentStoreId }: SidebarProps) {
  const pathname = usePathname();
  const currentStore = stores.find((store) => store.id === currentStoreId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-sidebar-border bg-sidebar-accent flex shrink-0 items-center gap-2 border-b p-3">
        <Logo aria-hidden className="size-8 shrink-0 overflow-visible" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="lead-style block truncate font-medium tracking-[-0.01em]">{businessName}</span>
          <span className="caption-style text-subtle block truncate">{currentStore?.name ?? "No store"}</span>
        </div>
      </div>

      {stores.length > 1 && <StoreSwitcher stores={stores} currentStoreId={currentStoreId} />}

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Primary">
          <SidebarSection>
            {navItemsFor(role).map((item) => (
              <SidebarNavItem
                key={item.key}
                icon={NAV_ICONS[item.key]}
                label={item.label}
                href={item.href}
                active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
              />
            ))}
          </SidebarSection>
        </nav>
      </ScrollArea>

      <div className="border-sidebar-border bg-sidebar-accent flex shrink-0 items-center justify-between gap-2 border-t p-4">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="lead-style block truncate font-medium tracking-[-0.01em]">{staffName}</span>
          <span className="caption-style text-subtle block capitalize">{role}</span>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="muted" size="md">
            <LogOutIcon aria-hidden className="size-3.5" />
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
