"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";

type Details = { name: string; guests: string };

function DetailsForm({ initial, onSave, onDone }: { initial: Details; onSave: (details: Details) => Promise<string | null>; onDone: () => void }) {
  const [name, setName] = useState(initial.name);
  const [guests, setGuests] = useState(initial.guests);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await onSave({ name, guests });
    setPending(false);
    if (result) setError(result);
    else onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Guests and name</DialogTitle>
        <DialogDescription>The name shows on the floor, the bill and the kitchen tickets.</DialogDescription>
      </DialogHeader>
      <Field label="Guests" htmlFor="details-guests">
        <Input id="details-guests" className="min-h-11" inputMode="numeric" value={guests} onChange={(event) => setGuests(event.target.value)} />
      </Field>
      <Field label="Name" htmlFor="details-name" hint="Optional for a table">
        <Input id="details-name" className="min-h-11" maxLength={40} value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending}>Save</Button>
      </DialogFooter>
    </form>
  );
}

export default function TabDetailsDialog({ open, initial, onOpenChange, onSave }: { open: boolean; initial: Details; onOpenChange: (open: boolean) => void; onSave: (details: Details) => Promise<string | null> }) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <DetailsForm key={openCount} initial={initial} onSave={onSave} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}
