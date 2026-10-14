"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import FormMessage from "@/components/_common/form-message";
import { recordStock } from "@/lib/catalog/stock-actions";
import type { ActionResult } from "@/lib/action-result";

type Kind = "received" | "counted" | "damaged" | "correction" | "transfer";

type StockActionDialogProps = {
  variantId: string;
  variantName: string;
  quantity: number;
  otherStores: { id: string; name: string }[];
};

const KIND_LABELS: Record<Kind, string> = {
  received: "Received stock",
  counted: "Counted the shelf",
  damaged: "Damaged or lost",
  correction: "Correct a mistake",
  transfer: "Send to another store",
};

function StockActionForm({ variantId, variantName, quantity, otherStores, onSaved }: StockActionDialogProps & { onSaved: () => void }) {
  const [kind, setKind] = useState<Kind>("received");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [toStoreId, setToStoreId] = useState(otherStores[0]?.id ?? "");
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, formData) => {
    const result = await recordStock(prev, formData);
    if (result?.ok) onSaved();
    return result;
  }, null);
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};
  const amountField = kind === "counted" ? "counted" : kind === "correction" ? "change" : "quantity";
  const amountLabel = kind === "counted" ? "Counted on the shelf" : kind === "correction" ? "Change (use - to subtract)" : "Quantity";
  const kinds = (Object.keys(KIND_LABELS) as Kind[]).filter((value) => value !== "transfer" || otherStores.length > 0);

  return (
    <form action={action} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Update stock for {variantName}</DialogTitle>
        <DialogDescription>Currently {quantity} in this store.</DialogDescription>
      </DialogHeader>
      <FormMessage result={state && !state.ok && state.error ? state : null} />
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="kind" value={kind} />
      <Field label="What happened" htmlFor="stock-kind">
        <Select value={kind} onValueChange={(value) => setKind(value as Kind)}>
          <SelectTrigger id="stock-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kinds.map((value) => (
              <SelectItem key={value} value={value}>{KIND_LABELS[value]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {kind === "transfer" && (
        <Field label="To store" htmlFor="stock-to" error={errors.toStoreId}>
          <Select name="toStoreId" value={toStoreId} onValueChange={setToStoreId}>
            <SelectTrigger id="stock-to" aria-invalid={Boolean(errors.toStoreId)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {otherStores.map((store) => (
                <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      <Field label={amountLabel} htmlFor="stock-amount" error={errors[amountField]}>
        <Input id="stock-amount" name={amountField} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} required />
      </Field>
      <Field label={kind === "correction" ? "Reason" : "Note (optional)"} htmlFor="stock-note" error={errors.note}>
        <Input id="stock-note" name="note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </form>
  );
}

export default function StockActionDialog(props: StockActionDialogProps) {
  const [open, setOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`Update stock for ${props.variantName}`}>Update stock</Button>
      </DialogTrigger>
      <DialogContent>
        <StockActionForm key={openCount} {...props} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
