"use client";

import Button, { buttonVariants } from "@/components/_ui/button";
import { cn } from "@/lib/utils";

type SaleDoneProps = { orderId: string; receiptNumber: number; change: number; money: (minor: number) => string; onNewSale: () => void; onVoid: () => void };

export default function SaleDone({ orderId, receiptNumber, change, money, onNewSale, onVoid }: SaleDoneProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h2>Sale complete</h2>
      <span className="lead-style">Receipt #{receiptNumber}</span>
      {change > 0 && <span className="h1-style">Change due {money(change)}</span>}
      <div className="flex flex-wrap justify-center gap-2">
        <a href={`/receipts/${orderId}?print=1`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "secondary", size: "md" }), "min-h-11")}>
          Print receipt
        </a>
        <Button variant="primary" size="md" className="min-h-11" onClick={onNewSale} autoFocus>
          New sale
        </Button>
      </div>
      <Button variant="ghost" size="md" className="mt-6 min-h-11" onClick={onVoid}>
        Void sale
      </Button>
    </div>
  );
}
