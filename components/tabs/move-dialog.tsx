"use client";

import { useState } from "react";
import Button from "@/components/_ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/_ui/dialog";

export type FreeTable = { id: string; name: string; areaName: string };

type MoveDialogProps = { open: boolean; tables: FreeTable[]; onOpenChange: (open: boolean) => void; onMove: (tableId: string) => Promise<string | null> };

export default function MoveDialog({ open, tables, onOpenChange, onMove }: MoveDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function move(tableId: string) {
    setPending(true);
    const result = await onMove(tableId);
    setPending(false);
    setError(result);
    if (!result) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setError(null); onOpenChange(next); }}>
      <DialogContent>
        <div className="flex flex-col gap-4 p-6">
          <DialogHeader>
            <DialogTitle>Move to another table</DialogTitle>
            <DialogDescription>Only free tables are listed.</DialogDescription>
          </DialogHeader>
          {tables.length === 0 ? (
            <p className="text-subtle">Every table has an open tab.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {tables.map((table) => (
                <li key={table.id}>
                  <Button variant="secondary" size="md" className="min-h-11 w-full flex-col gap-0" disabled={pending} onClick={() => move(table.id)}>
                    <span>{table.name}</span>
                    <span className="caption-style text-soft">{table.areaName}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {error && <span role="alert" className="caption-style text-danger">{error}</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
