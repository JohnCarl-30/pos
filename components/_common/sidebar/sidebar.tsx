"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/_ui/sheet";
import SidebarContent, { type SidebarProps } from "./sidebar-content";
import SidebarResizer from "./sidebar-resizer";
import { useUiStore } from "@/stores/ui-store";

export default function Sidebar(props: SidebarProps) {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);

  return (
    <>
      <aside className="border-sidebar-border bg-sidebar relative hidden w-(--sidebar-width) shrink-0 border-r lg:flex lg:flex-col">
        <SidebarContent {...props} />
        <SidebarResizer />
      </aside>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="border-sidebar-border bg-sidebar w-[254px] max-w-[85vw]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">POS sections</SheetDescription>
          <SidebarContent {...props} />
        </SheetContent>
      </Sheet>
    </>
  );
}
