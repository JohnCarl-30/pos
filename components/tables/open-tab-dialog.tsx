"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { openTab } from "@/lib/tabs/actions";

export type OpenTabTarget = { tableId: string; tableName: string } | { bar: true };

function OpenTabForm({ target }: { target: OpenTabTarget }) {
  const router = useRouter();
  const bar = "bar" in target;
  const [guests, setGuests] = useState(bar ? "" : "2");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await openTab({ tableId: bar ? null : target.tableId, name, guests });
    if (result.ok) router.push(`/tabs/${result.tabId}`);
    else {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>{bar ? "New bar tab" : `Open ${target.tableName}`}</DialogTitle>
        <DialogDescription>{bar ? "Name the tab so the bar can find it later." : "How many guests are at the table?"}</DialogDescription>
      </DialogHeader>
      {bar ? (
        <Field label="Name" htmlFor="tab-name">
          <Input id="tab-name" className="min-h-11" maxLength={40} value={name} autoFocus onChange={(event) => setName(event.target.value)} />
        </Field>
      ) : (
        <Field label="Guests" htmlFor="tab-guests">
          <Input id="tab-guests" className="min-h-11" inputMode="numeric" value={guests} autoFocus onChange={(event) => setGuests(event.target.value)} />
        </Field>
      )}
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending}>
          {pending ? "Opening…" : "Open tab"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function OpenTabDialog({ target, onClose }: { target: OpenTabTarget | null; onClose: () => void }) {
  const open = target !== null;
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>{target && <OpenTabForm key={openCount} target={target} />}</DialogContent>
    </Dialog>
  );
}
