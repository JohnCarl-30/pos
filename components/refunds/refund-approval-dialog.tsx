"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { requestRefundApproval } from "@/lib/orders/actions";

type RefundApprovalDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  amount: number;
  money: (minor: number) => string;
  onApproved: (approval: { id: string; maxAmount: number }) => void;
};

function ApprovalForm({ orderId, amount, money, onApproved }: Omit<RefundApprovalDialogProps, "open" | "onOpenChange">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await requestRefundApproval({ email: email.trim(), password, orderId, amount });
      if (result.ok) onApproved({ id: result.approvalId, maxAmount: result.maxAmount });
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
        <DialogTitle>Manager approval</DialogTitle>
        <DialogDescription>A refund of {money(amount)} needs a manager or owner to approve it here. You stay signed in.</DialogDescription>
      </DialogHeader>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <Field label="Manager email" htmlFor="refund-approval-email">
        <Input id="refund-approval-email" type="email" autoComplete="off" className="min-h-11" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </Field>
      <Field label="Manager password" htmlFor="refund-approval-password">
        <Input id="refund-approval-password" type="password" autoComplete="off" className="min-h-11" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending}>
          {pending ? "Checking…" : "Approve"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function RefundApprovalDialog({ open, onOpenChange, ...props }: RefundApprovalDialogProps) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ApprovalForm key={openCount} {...props} />
      </DialogContent>
    </Dialog>
  );
}
