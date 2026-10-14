"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import RefundPanel from "@/components/refunds/refund-panel";
import { findSaleByReceipt } from "@/lib/orders/actions";
import type { RefundContext } from "@/lib/orders/detail";
import type { StaffRole } from "@/lib/auth/roles";

type ReturnDialogProps = { sessionId: string; role: StaffRole; currency: string };

function ReturnForm({ sessionId, role, currency, onDone }: ReturnDialogProps & { onDone: () => void }) {
  const [receipt, setReceipt] = useState("");
  const [context, setContext] = useState<RefundContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await findSaleByReceipt({ receiptNumber: Number(receipt.trim().replace(/^#/, "")) });
      if (result.ok) setContext(result.context);
      else setError(result.error);
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (context) return <RefundPanel context={context} sessionId={sessionId} role={role} currency={currency} onDone={onDone} />;

  return (
    <form onSubmit={find} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Return</DialogTitle>
        <DialogDescription>Scan or type the receipt number from the sale.</DialogDescription>
      </DialogHeader>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <Field label="Receipt number" htmlFor="return-receipt">
        <Input id="return-receipt" inputMode="numeric" className="min-h-11" value={receipt} onChange={(event) => setReceipt(event.target.value)} required autoFocus />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending}>
          {pending ? "Finding…" : "Find sale"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function ReturnDialog(props: ReturnDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }

  function change(next: boolean) {
    setOpen(next);
    if (!next) router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="md" className="min-h-11">Return</Button>
      </DialogTrigger>
      <DialogContent className="max-w-[40em]">
        <ReturnForm key={openCount} {...props} onDone={() => change(false)} />
      </DialogContent>
    </Dialog>
  );
}
