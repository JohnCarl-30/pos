"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import { closeTill, type CloseTillState } from "@/lib/register/actions";

type CloseTillDialogProps = { sessionId: string; currency: string; money: (minor: number) => string };

function CloseTillForm({ sessionId, currency, money, onClosed, onDone }: CloseTillDialogProps & { onClosed: () => void; onDone: () => void }) {
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [state, action, pending] = useActionState<CloseTillState, FormData>(
    async (prev, formData) => {
      const result = await closeTill(prev, formData);
      if (result.summary) onClosed();
      return result;
    },
    { error: null, summary: null },
  );

  if (state.summary) {
    const { cash_tips, cash_refunds, voided_count, expected_cash, counted_cash, difference } = state.summary;
    return (
      <div className="flex flex-col gap-4 p-6">
        <DialogHeader>
          <DialogTitle>Till closed</DialogTitle>
          <DialogDescription>Here&apos;s how the drawer compares with today&apos;s cash sales.</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-1 tabular-nums">
          {cash_tips > 0 && <div className="flex justify-between"><dt>Cash tips</dt><dd>{money(cash_tips)}</dd></div>}
          {cash_refunds > 0 && <div className="flex justify-between"><dt>Cash refunds</dt><dd>−{money(cash_refunds)}</dd></div>}
          {voided_count > 0 && <div className="flex justify-between"><dt>Voided sales</dt><dd>{voided_count}</dd></div>}
          <div className="flex justify-between"><dt>Expected</dt><dd>{money(expected_cash)}</dd></div>
          <div className="flex justify-between"><dt>Counted</dt><dd>{money(counted_cash)}</dd></div>
          <div className={difference === 0 ? "flex justify-between" : "text-warning flex justify-between"}>
            <dt>Difference</dt>
            <dd>{difference === 0 ? "None" : `${difference > 0 ? "Over" : "Short"} ${money(Math.abs(difference))}`}</dd>
          </div>
        </dl>
        <DialogFooter>
          <Button variant="primary" size="md" className="min-h-11" onClick={onDone}>Done</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Close till</DialogTitle>
        <DialogDescription>Count all the cash in the drawer, including the starting float.</DialogDescription>
      </DialogHeader>
      {state.error && <span role="alert" className="caption-style text-danger">{state.error}</span>}
      <input type="hidden" name="sessionId" value={sessionId} />
      <Field label={`Counted cash (${currency})`} htmlFor="counted-cash">
        <Input id="counted-cash" name="countedCash" inputMode="decimal" className="min-h-11" value={counted} onChange={(event) => setCounted(event.target.value)} required />
      </Field>
      <Field label="Note (optional)" htmlFor="close-note">
        <Input id="close-note" name="note" className="min-h-11" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending}>{pending ? "Closing…" : "Close till"}</Button>
      </DialogFooter>
    </form>
  );
}

export default function CloseTillDialog(props: CloseTillDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }

  function change(next: boolean) {
    setOpen(next);
    if (!next && closed) router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="md" className="min-h-11">Close till</Button>
      </DialogTrigger>
      <DialogContent>
        <CloseTillForm key={openCount} {...props} onClosed={() => setClosed(true)} onDone={() => change(false)} />
      </DialogContent>
    </Dialog>
  );
}
