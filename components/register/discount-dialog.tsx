"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { formatAmount, parseMoney } from "@/lib/money";
import { formatBpsAsPercent, parsePercentToBps } from "@/lib/percent";
import type { Discount } from "@/lib/register/cart";

type DiscountDialogProps = {
  open: boolean;
  title: string;
  current: Discount;
  currency: string;
  onOpenChange: (open: boolean) => void;
  onApply: (discount: Discount) => void;
};

function DiscountForm({ title, current, currency, onApply }: Omit<DiscountDialogProps, "open" | "onOpenChange">) {
  const [mode, setMode] = useState<"percent" | "amount">(current && "amount" in current ? "amount" : "percent");
  const [value, setValue] = useState(current ? ("bps" in current ? formatBpsAsPercent(current.bps) : formatAmount(current.amount, currency)) : "");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value.trim() === "") return onApply(null);
    if (mode === "percent") {
      const bps = parsePercentToBps(value);
      if (bps === null || bps > 10_000) return setError("Enter a percentage from 0 to 100, like 10");
      return onApply(bps === 0 ? null : { bps });
    }
    const amount = parseMoney(value, currency);
    if (amount === null || amount < 0) return setError("Enter an amount like 2.50");
    return onApply(amount === 0 ? null : { amount });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Leave it empty to remove the discount.</DialogDescription>
      </DialogHeader>
      <div role="group" aria-label="Discount type" className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="md" className="min-h-11 aria-pressed:bg-white/10" aria-pressed={mode === "percent"} onClick={() => setMode("percent")}>
          Percent
        </Button>
        <Button variant="secondary" size="md" className="min-h-11 aria-pressed:bg-white/10" aria-pressed={mode === "amount"} onClick={() => setMode("amount")}>
          Amount
        </Button>
      </div>
      <Field label={mode === "percent" ? "Percentage off" : `Amount off (${currency})`} htmlFor="discount-value" error={error ?? undefined}>
        <Input id="discount-value" inputMode="decimal" className="min-h-11" value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
      </Field>
      <DialogFooter>
        {current && (
          <Button variant="ghost" size="md" className="min-h-11" onClick={() => onApply(null)}>
            Remove discount
          </Button>
        )}
        <Button type="submit" variant="primary" size="md" className="min-h-11">
          Apply
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function DiscountDialog({ open, onOpenChange, ...props }: DiscountDialogProps) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DiscountForm key={openCount} {...props} />
      </DialogContent>
    </Dialog>
  );
}
