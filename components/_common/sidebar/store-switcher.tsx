"use client";

import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import { selectStore } from "@/lib/auth/store-actions";
import type { StaffStore } from "@/lib/auth/pick-store";

type StoreSwitcherProps = { stores: StaffStore[]; currentStoreId: string | null };

export default function StoreSwitcher({ stores, currentStoreId }: StoreSwitcherProps) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="border-sidebar-border shrink-0 border-b p-3">
      <Select
        value={currentStoreId ?? undefined}
        onValueChange={(storeId) => startTransition(() => selectStore(storeId))}
        disabled={pending}
      >
        <SelectTrigger aria-label="Current store">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {stores.map((store) => (
            <SelectItem key={store.id} value={store.id}>
              {store.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
