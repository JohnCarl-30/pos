"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";

export type TextRequest = { title: string; description: string; label: string; submit: string; initial: string; maxLength: number; onSubmit: (value: string) => Promise<string | null> };

function TextForm({ request, onDone }: { request: TextRequest; onDone: () => void }) {
  const [value, setValue] = useState(request.initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await request.onSubmit(value);
    setPending(false);
    if (result) setError(result);
    else onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>{request.title}</DialogTitle>
        <DialogDescription>{request.description}</DialogDescription>
      </DialogHeader>
      <Field label={request.label} htmlFor="tab-text">
        <Input id="tab-text" className="min-h-11" maxLength={request.maxLength} value={value} autoFocus onChange={(event) => setValue(event.target.value)} />
      </Field>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending}>{request.submit}</Button>
      </DialogFooter>
    </form>
  );
}

export default function TextDialog({ request, onClose }: { request: TextRequest | null; onClose: () => void }) {
  const open = request !== null;
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>{request && <TextForm key={openCount} request={request} onDone={onClose} />}</DialogContent>
    </Dialog>
  );
}
