"use client";

import type { ReactNode } from "react";
import Button from "@/components/_ui/button";
import { useUiStore } from "@/stores/ui-store";
import MenuIcon from "@/public/assets/images/_common/menu.svg";
import SearchIcon from "@/public/assets/images/_common/search.svg";

type PageHeaderProps = { title: string; actions?: ReactNode };

export default function PageHeader({ title, actions }: PageHeaderProps) {
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);

  return (
    <header className="border-line-strong flex shrink-0 items-center justify-between gap-2 border-b px-4 py-[14px]">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="secondary" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>
          <MenuIcon aria-hidden className="size-3.5" />
        </Button>
        <h1 className="truncate">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <Button variant="secondary" size="icon" aria-label="Go to page" aria-keyshortcuts="Meta+K Control+K" onClick={() => setCommandOpen(true)}>
          <SearchIcon aria-hidden className="size-3.5" />
        </Button>
      </div>
    </header>
  );
}
