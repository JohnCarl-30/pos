"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button, { buttonVariants } from "@/components/_ui/button";
import RefundDialog from "@/components/refunds/refund-dialog";
import VoidDialog from "@/components/refunds/void-dialog";
import { formatMoney } from "@/lib/money";
import type { RefundContext } from "@/lib/orders/detail";
import type { StaffRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

type OrderActionsProps = {
  orderId: string;
  receiptNumber: number;
  total: number;
  context: RefundContext;
  availability: "ok" | "no-till" | "nothing";
  sessionId: string | null;
  voidable: boolean;
  role: StaffRole;
  currency: string;
};

export default function OrderActions({ orderId, receiptNumber, total, context, availability, sessionId, voidable, role, currency }: OrderActionsProps) {
  const router = useRouter();
  const [refundOpen, setRefundOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const money = (minor: number) => formatMoney(minor, currency, "en-US");

  function changeRefund(next: boolean) {
    setRefundOpen(next);
    if (!next) router.refresh();
  }

  return (
    <>
      {availability === "no-till" && <span className="caption-style text-subtle hidden sm:inline">Open a till to give refunds</span>}
      <a href={`/receipts/${orderId}?print=1`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "md" }), "min-h-11")}>
        Reprint receipt
      </a>
      {voidable && (
        <Button variant="secondary" size="md" className="min-h-11" onClick={() => setVoidOpen(true)}>
          Void
        </Button>
      )}
      {availability !== "nothing" && (
        <Button variant="primary" size="md" className="min-h-11" disabled={availability === "no-till"} onClick={() => setRefundOpen(true)}>
          Refund
        </Button>
      )}
      {sessionId && (
        <RefundDialog open={refundOpen} onOpenChange={changeRefund} context={context} sessionId={sessionId} role={role} currency={currency} onDone={() => changeRefund(false)} />
      )}
      <VoidDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        orderId={orderId}
        receiptNumber={receiptNumber}
        total={total}
        money={money}
        onVoided={() => {
          setVoidOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
