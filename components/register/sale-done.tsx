"use client";

import { useState } from "react";
import Button, { buttonVariants } from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import Card from "@/components/_common/card";
import { cn } from "@/lib/utils";

const AUTO_KITCHEN = "pos-auto-kitchen";

type SaleDoneProps = {
  orderId: string;
  receiptNumber: number;
  total: number;
  tip: number;
  change: number;
  kitchen: boolean;
  money: (minor: number) => string;
  onNewSale: () => void;
  onVoid: () => void;
  tab?: { paid: boolean } | null;
};

function readAuto(): boolean {
  try {
    return window.localStorage.getItem(AUTO_KITCHEN) === "1";
  } catch {
    return false;
  }
}

export default function SaleDone({ orderId, receiptNumber, total, tip, change, kitchen, money, onNewSale, onVoid, tab }: SaleDoneProps) {
  const [auto, setAuto] = useState(readAuto);
  const kitchenHref = `/receipts/${orderId}/kitchen?print=1`;

  function changeAuto(next: boolean) {
    setAuto(next);
    try {
      window.localStorage.setItem(AUTO_KITCHEN, next ? "1" : "0");
    } catch {}
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <Card className="flex w-full max-w-[24em] flex-col items-center gap-5 p-6">
        <div className="flex flex-col items-center gap-2">
          <h2>{tab?.paid ? "Tab paid" : "Sale complete"}</h2>
          <span className="caption-style text-soft">Receipt #{receiptNumber}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[28px] leading-none font-semibold tabular-nums">{money(total + tip)}</span>
          <span className="caption-style text-soft tabular-nums">{tip > 0 ? `Paid · Tip ${money(tip)}` : "Paid"}</span>
        </div>
        {change > 0 && <span className="h1-style text-warning tabular-nums">Change due {money(change)}</span>}
        <div className="flex w-full flex-wrap justify-center gap-2">
          <a href={`/receipts/${orderId}?print=1`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "secondary", size: "md" }), "min-h-11 flex-1")}>
            Print receipt
          </a>
          {tab?.paid ? (
            <Button href="/tables" variant="primary" size="md" className="min-h-11 flex-1" autoFocus>
              Back to tables
            </Button>
          ) : (
            <Button variant="primary" size="md" className="min-h-11 flex-1" onClick={onNewSale} autoFocus>
              {tab ? "Pay the rest" : "New sale"}
            </Button>
          )}
        </div>
        {kitchen && (
          <div className="flex w-full flex-col items-center gap-2">
            <a href={kitchenHref} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "secondary", size: "md" }), "min-h-11 w-full")}>
              Print kitchen ticket
            </a>
            <label className="caption-style text-soft flex items-center gap-2">
              <Checkbox aria-label="Auto-print kitchen tickets on this device" checked={auto} onCheckedChange={(checked) => changeAuto(checked === true)} />
              Auto-print kitchen tickets on this device
            </label>
          </div>
        )}
      </Card>
      <Button variant="ghost" size="md" className="min-h-11" onClick={onVoid}>
        Void sale
      </Button>
      {kitchen && auto && <iframe title="Kitchen ticket" src={kitchenHref} className="pointer-events-none fixed top-0 left-0 size-px opacity-0" />}
    </div>
  );
}
