"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { requestApproval } from "@/lib/register/actions";
import { formatBpsAsPercent } from "@/lib/percent";

type ApprovalDialogProps = {
  open: boolean;
  shareBps: number;
  onOpenChange: (open: boolean) => void;
  onApproved: (approval: { id: string; maxBps: number }) => void;
};

function ApprovalForm({ shareBps, onApproved }: Pick<ApprovalDialogProps, "shareBps" | "onApproved">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const result = await requestApproval({ email: email.trim(), password, shareBps });
    setPending(false);
    if (result.ok) onApproved({ id: result.approvalId, maxBps: result.maxBps });
    else setError(result.error);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Manager approval</DialogTitle>
        <DialogDescription>
          This sale has {formatBpsAsPercent(shareBps)}% off, which is over the cashier limit. A manager or owner can approve it here. You stay signed in.
        </DialogDescription>
      </DialogHeader>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <Field label="Manager email" htmlFor="approval-email">
        <Input id="approval-email" type="email" autoComplete="off" className="min-h-11" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </Field>
      <Field label="Manager password" htmlFor="approval-password">
        <Input id="approval-password" type="password" autoComplete="off" className="min-h-11" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending}>
          {pending ? "Checking…" : "Approve"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function ApprovalDialog({ open, onOpenChange, ...props }: ApprovalDialogProps) {
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
