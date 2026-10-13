"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Kbd } from "@/components/_ui/command";
import { NAV_ICONS } from "@/components/_common/sidebar/nav-icons";
import { navItemsFor } from "@/lib/nav";
import type { StaffRole } from "@/lib/auth/roles";
import { useUiStore } from "@/stores/ui-store";

export default function CommandMenu({ role }: { role: StaffRole }) {
  const open = useUiStore((state) => state.commandOpen);
  const setOpen = useUiStore((state) => state.setCommandOpen);
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      const { commandOpen, setCommandOpen } = useUiStore.getState();
      setCommandOpen(!commandOpen);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Go to" description="Jump to a section of the POS">
      <Command>
        <CommandInput placeholder="Go to…" trailing={<Kbd>Esc</Kbd>} />
        <CommandList>
          <CommandEmpty>No sections match.</CommandEmpty>
          <CommandGroup heading="Sections">
            {navItemsFor(role).map((item) => {
              const Icon = NAV_ICONS[item.key];
              return (
                <CommandItem
                  key={item.key}
                  value={item.label}
                  onSelect={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                >
                  <Icon aria-hidden className="text-subtle size-3.5" />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
