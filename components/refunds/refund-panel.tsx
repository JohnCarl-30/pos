"use client";

import { useState } from "react";
import Button, { buttonVariants } from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import RefundApprovalDialog from "./refund-approval-dialog";
import { checkPayout, priceRefund, suggestPayout, type RefundMethod, type RefundPayment } from "@/lib/refunds";
import { currencyDigits, formatMoney, parseMoney } from "@/lib/money";
import { refundSale } from "@/lib/orders/actions";
import { REFUND_REASONS, type RefundContext, type RefundReason } from "@/lib/orders/detail";
import type { StaffRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

type RefundPanelProps = { context: RefundContext; sessionId: string; role: StaffRole; currency: string; onDone: () => void };
type PayoutRow = { method: RefundMethod; amount: string; reference: string };
type Done = { refundId: string; receiptNumber: number; total: number };

const METHOD_LABELS: Record<RefundMethod, string> = { card: "Card", cash: "Cash", other: "Other" };
const METHODS: RefundMethod[] = ["card", "cash", "other"];

function toMajor(minor: number, currency: string): string {
  const digits = currencyDigits(currency);
  return (minor / 10 ** digits).toFixed(digits);
}

export default function RefundPanel({ context, sessionId, role, currency, onDone }: RefundPanelProps) {
  const money = (minor: number) => formatMoney(minor, currency, "en-US");
  const [units, setUnits] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState<RefundReason>("changed_mind");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [approval, setApproval] = useState<{ id: string; maxAmount: number } | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const open = context.lines.filter((line) => line.quantity - line.refunded > 0);
  const chosen = open.filter((line) => (units[line.orderItemId] ?? 0) > 0);
  const totals = priceRefund(
    chosen.map((line) => ({ lineTotal: line.lineTotal, tax: line.tax, quantity: line.quantity, refunded: line.refunded, units: units[line.orderItemId] })),
  );
  const [prevTotal, setPrevTotal] = useState(totals.total);
  if (totals.total !== prevTotal) {
    setPrevTotal(totals.total);
    setRows(null);
  }

  const shown: PayoutRow[] = rows ?? suggestPayout(totals.total, context.room).map((payment) => ({ method: payment.method, amount: toMajor(payment.amount, currency), reference: "" }));
  const parsed = shown.map((row) => ({ row, amount: parseMoney(row.amount, currency) }));
  const payments: RefundPayment[] | null = parsed.some((entry) => entry.amount === null)
    ? null
    : parsed.map(({ row, amount }) => ({ method: row.method, amount: amount ?? 0, reference: row.method === "cash" ? null : row.reference.trim() || null }));
  const payoutError = chosen.length === 0 ? null : payments === null ? "Enter each amount, like 3.25" : checkPayout(totals.total, payments, context.room);
  const needsApproval = role === "cashier" && (approval === null || approval.maxAmount < totals.total);
  const ready = chosen.length > 0 && payoutError === null && (reason !== "other" || note.trim().length > 0) && !pending;

  function step(orderItemId: string, left: number, delta: number) {
    setUnits((current) => ({ ...current, [orderItemId]: Math.min(left, Math.max(0, (current[orderItemId] ?? 0) + delta)) }));
  }

  function editRow(index: number, change: Partial<PayoutRow>) {
    setRows(shown.map((row, position) => (position === index ? { ...row, ...change } : row)));
  }

  async function submit() {
    if (!payments) return;
    setPending(true);
    setError(null);
    try {
      const result = await refundSale({
        orderId: context.orderId,
        sessionId,
        lines: chosen.map((line) => ({ orderItemId: line.orderItemId, quantity: units[line.orderItemId], restock: restock[line.orderItemId] ?? true })),
        payments,
        approvalId: approval?.id ?? null,
        reason,
        note: note.trim(),
      });
      if (result.ok) {
        setDone({ refundId: result.refundId, receiptNumber: result.receiptNumber, total: result.total });
      } else {
        if (result.kind === "approval") setApproval(null);
        setError(result.error);
      }
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        <DialogHeader>
          <DialogTitle>Refund #{done.receiptNumber} recorded</DialogTitle>
          <DialogDescription>{money(done.total)} back to the customer.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap justify-center gap-2">
          <a href={`/receipts/refunds/${done.refundId}?print=1`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "secondary", size: "md" }), "min-h-11")}>
            Print refund slip
          </a>
          <Button variant="primary" size="md" className="min-h-11" onClick={onDone} autoFocus>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Refund receipt #{context.receiptNumber}</DialogTitle>
        <DialogDescription>
          {[context.registerName, new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: context.timeZone }).format(new Date(context.createdAt)), money(context.total)].filter(Boolean).join(" · ")}. Pick what&apos;s coming back and how the money goes back.
        </DialogDescription>
      </DialogHeader>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <ul className="flex flex-col gap-3">
        {open.map((line) => {
          const left = line.quantity - line.refunded;
          const count = units[line.orderItemId] ?? 0;
          const stocked = restock[line.orderItemId] ?? true;
          return (
            <li key={line.orderItemId} className="border-line-strong flex flex-col gap-2 border-b pb-3">
              <div className="flex items-baseline justify-between gap-2">
                <span>{line.name}</span>
                <span className="caption-style text-subtle">
                  {money(line.unitPaid)} each · {left} of {line.quantity} left
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="icon" className="size-11" aria-label={`Fewer ${line.name}`} disabled={count === 0} onClick={() => step(line.orderItemId, left, -1)}>
                  −
                </Button>
                <output aria-label={`Refund quantity of ${line.name}`} className="min-w-8 text-center tabular-nums">
                  {count}
                </output>
                <Button variant="secondary" size="icon" className="size-11" aria-label={`More ${line.name}`} disabled={count >= left} onClick={() => step(line.orderItemId, left, 1)}>
                  +
                </Button>
                <div role="group" aria-label={`Stock for ${line.name}`} className="ml-auto flex gap-1">
                  <Button variant="ghost" size="md" aria-pressed={stocked} className="aria-pressed:bg-muted aria-pressed:text-foreground min-h-11" onClick={() => setRestock((current) => ({ ...current, [line.orderItemId]: true }))}>
                    Back to stock
                  </Button>
                  <Button variant="ghost" size="md" aria-pressed={!stocked} className="aria-pressed:bg-warning/15 aria-pressed:text-warning min-h-11" onClick={() => setRestock((current) => ({ ...current, [line.orderItemId]: false }))}>
                    Damaged
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Field label="Reason" htmlFor="refund-reason">
        <Select value={reason} onValueChange={(value) => setReason(value as RefundReason)}>
          <SelectTrigger id="refund-reason" className="min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REFUND_REASONS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {reason === "other" && (
        <Field label="Note" htmlFor="refund-note">
          <Input id="refund-note" className="min-h-11" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} required />
        </Field>
      )}
      <div className="flex justify-between font-medium tabular-nums">
        <span>Refund total</span>
        <span>{money(totals.total)}</span>
      </div>
      {chosen.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="caption-style text-subtle mb-1">Money back</legend>
          {shown.map((row, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Select value={row.method} onValueChange={(value) => editRow(index, { method: value as RefundMethod, reference: value === "cash" ? "" : row.reference })}>
                <SelectTrigger aria-label={`Refund method ${index + 1}`} className="min-h-11 w-auto min-w-[7em]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {METHOD_LABELS[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input aria-label={`Refund amount ${index + 1}`} inputMode="decimal" className="min-h-11 w-[7em]" value={row.amount} onChange={(event) => editRow(index, { amount: event.target.value })} />
              {row.method !== "cash" && (
                <Input
                  aria-label={`Reference ${index + 1}`}
                  placeholder="Reference (optional)"
                  maxLength={100}
                  className="min-h-11 min-w-[8em] flex-1"
                  value={row.reference}
                  onChange={(event) => editRow(index, { reference: event.target.value })}
                />
              )}
              <Button variant="ghost" size="md" className="min-h-11" aria-label={`Remove refund payment ${index + 1}`} onClick={() => setRows(shown.filter((_, position) => position !== index))}>
                Remove
              </Button>
            </div>
          ))}
          <Button variant="secondary" size="md" className="min-h-11 self-start" onClick={() => setRows([...shown, { method: "cash", amount: "", reference: "" }])}>
            Add payment method
          </Button>
          {payoutError && <span role="status" className="caption-style text-warning">{payoutError}</span>}
        </fieldset>
      )}
      <DialogFooter>
        {needsApproval ? (
          <Button variant="primary" size="md" className="min-h-11" disabled={!ready} onClick={() => setApprovalOpen(true)}>
            Get approval
          </Button>
        ) : (
          <Button variant="primary" size="md" className="min-h-11" disabled={!ready} onClick={submit}>
            {pending ? "Refunding…" : `Refund ${money(totals.total)}`}
          </Button>
        )}
      </DialogFooter>
      <RefundApprovalDialog
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        orderId={context.orderId}
        amount={totals.total}
        money={money}
        onApproved={(granted) => {
          setApproval(granted);
          setApprovalOpen(false);
        }}
      />
    </div>
  );
}
