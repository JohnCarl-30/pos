"use client";

import { useState } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { summarisePayments, type PaymentInput, type PaymentMethod } from "@/lib/checkout";
import { formatAmount, parseMoney } from "@/lib/money";
import { TIP_PRESETS, tipFor } from "@/lib/tips";

type PayDialogProps = {
  open: boolean;
  total: number;
  currency: string;
  offline: boolean;
  money: (minor: number) => string;
  onOpenChange: (open: boolean) => void;
  onComplete: (payments: PaymentInput[], tip: number) => Promise<string | null>;
};

type Row = { key: number; method: PaymentMethod; amount: string; tendered: string; reference: string };

const METHOD_LABELS: Record<PaymentMethod, string> = { cash: "Cash", card: "Card", other: "Other" };

function PayForm({ total, currency, offline, money, onComplete }: Omit<PayDialogProps, "open" | "onOpenChange">) {
  const [rows, setRows] = useState<Row[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tipChoice, setTipChoice] = useState<number | "custom">(0);
  const [customTip, setCustomTip] = useState("");
  const customParsed = tipChoice === "custom" ? parseMoney(customTip, currency) : null;
  const tip = tipChoice === "custom" ? (customParsed !== null && customParsed >= 0 ? customParsed : 0) : tipFor(total, tipChoice);
  const due = total + tip;

  let parseError: string | null = null;
  if (tipChoice === "custom" && customTip.trim() !== "" && (customParsed === null || customParsed < 0)) parseError = "Enter the tip, like 1.00";
  const payments: PaymentInput[] = rows.map((row) => {
    const amount = parseMoney(row.amount, currency);
    if (amount === null) parseError ??= `Enter the ${METHOD_LABELS[row.method].toLowerCase()} amount, like 5.00`;
    const tendered = row.method === "cash" && row.tendered.trim() !== "" ? parseMoney(row.tendered, currency) : null;
    if (row.method === "cash" && row.tendered.trim() !== "" && tendered === null) parseError ??= "Enter the cash received, like 20.00";
    return { method: row.method, amount: amount ?? 0, tendered, reference: row.reference.trim() || null };
  });
  const summary = summarisePayments(due, payments);
  const message = error ?? parseError ?? summary.error;

  function add(method: PaymentMethod) {
    setRows((current) => [...current, { key: nextKey, method, amount: formatAmount(summary.remaining, currency), tendered: "", reference: "" }]);
    setNextKey((key) => key + 1);
    setError(null);
  }

  function update(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setError(null);
  }

  async function complete() {
    setPending(true);
    try {
      const result = await onComplete(payments, tip);
      if (result) setError(result);
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Take payment</DialogTitle>
        <DialogDescription className="tabular-nums">Total {money(total)}</DialogDescription>
      </DialogHeader>
      <div role="group" aria-label="Tip" className="grid grid-cols-5 gap-2">
        {TIP_PRESETS.map((preset) => (
          <Button key={preset.bps} variant="secondary" size="md" aria-pressed={tipChoice === preset.bps} className="aria-pressed:bg-primary aria-pressed:text-primary-foreground min-h-11 px-1" onClick={() => setTipChoice(preset.bps)}>
            {preset.label}
          </Button>
        ))}
        <Button variant="secondary" size="md" aria-pressed={tipChoice === "custom"} className="aria-pressed:bg-primary aria-pressed:text-primary-foreground min-h-11 px-1" onClick={() => setTipChoice("custom")}>
          Custom
        </Button>
      </div>
      {tipChoice === "custom" && (
        <Input aria-label="Custom tip" inputMode="decimal" placeholder="0.00" className="min-h-11" value={customTip} onChange={(event) => setCustomTip(event.target.value)} />
      )}
      <div className="flex justify-between tabular-nums">
        <span>{tip > 0 ? `Tip ${money(tip)}` : "No tip"}</span>
        <span className="lead-style font-medium">Due {money(due)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["cash", "card", "other"] as PaymentMethod[]).map((method) => (
          <Button key={method} variant="secondary" size="md" className="min-h-11" disabled={summary.remaining === 0} onClick={() => add(method)}>
            {METHOD_LABELS[method]}
          </Button>
        ))}
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.key} className="border-line-strong flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="lead-style">{METHOD_LABELS[row.method]}</span>
              <Button variant="ghost" size="md" className="min-h-11" onClick={() => setRows((current) => current.filter((entry) => entry.key !== row.key))}>
                Remove
              </Button>
            </div>
            <Label htmlFor={`pay-amount-${row.key}`}>{`${METHOD_LABELS[row.method]} amount`}</Label>
            <Input id={`pay-amount-${row.key}`} inputMode="decimal" className="min-h-11" value={row.amount} onChange={(event) => update(row.key, { amount: event.target.value })} />
            {row.method === "cash" ? (
              <>
                <Label htmlFor={`pay-tendered-${row.key}`}>Cash received</Label>
                <div className="flex gap-2">
                  <Input id={`pay-tendered-${row.key}`} inputMode="decimal" className="min-h-11" placeholder="Optional" value={row.tendered} onChange={(event) => update(row.key, { tendered: event.target.value })} />
                  <Button variant="secondary" size="md" className="min-h-11" onClick={() => update(row.key, { tendered: row.amount })}>
                    Exact
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Label htmlFor={`pay-reference-${row.key}`}>Reference (optional)</Label>
                <Input id={`pay-reference-${row.key}`} className="min-h-11" maxLength={100} value={row.reference} onChange={(event) => update(row.key, { reference: event.target.value })} />
              </>
            )}
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-1">
        <div className="flex justify-between">
          <dt>Paid</dt>
          <dd>{money(summary.paid)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Remaining</dt>
          <dd>{money(summary.remaining)}</dd>
        </div>
        {summary.change > 0 && <div className="lead-style">Change {money(summary.change)}</div>}
      </dl>
      {message && <span role="alert" className="caption-style text-danger">{message}</span>}
      {offline && <span role="status" className="caption-style text-warning">You&apos;re offline. Reconnect to complete the sale.</span>}
      <Button variant="primary" size="md" className="min-h-11" disabled={!summary.complete || parseError !== null || offline || pending} onClick={complete}>
        {pending ? "Completing…" : "Complete sale"}
      </Button>
    </div>
  );
}

export default function PayDialog({ open, onOpenChange, total, ...props }: PayDialogProps) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  const [shownTotal, setShownTotal] = useState(total);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  if (open && total !== shownTotal) setShownTotal(total);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <PayForm key={openCount} total={shownTotal} {...props} />
      </DialogContent>
    </Dialog>
  );
}
