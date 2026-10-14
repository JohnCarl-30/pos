"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { voidSale } from "@/lib/orders/actions";

type VoidDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  receiptNumber: number;
  total: number;
  money: (minor: number) => string;
  onVoided: () => void;
};

function VoidForm({ orderId, receiptNumber, total, money, onVoided }: Omit<VoidDialogProps, "open" | "onOpenChange">) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await voidSale({ orderId, reason });
      if (result.ok) onVoided();
      else setError(result.error);
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Void receipt #{receiptNumber}</DialogTitle>
        <DialogDescription>The {money(total)} sale is cancelled and its items go back to stock. This can&apos;t be undone.</DialogDescription>
      </DialogHeader>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <Field label="Reason for the void" htmlFor="void-reason">
        <Input id="void-reason" className="min-h-11" maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} required autoFocus />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending || !reason.trim()}>
          {pending ? "Voiding…" : "Void sale"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function VoidDialog({ open, onOpenChange, ...props }: VoidDialogProps) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <VoidForm key={openCount} {...props} />
      </DialogContent>
    </Dialog>
  );
}
