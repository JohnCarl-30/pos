"use client";

import Button, { buttonVariants } from "@/components/_ui/button";
import Card from "@/components/_common/card";
import { cn } from "@/lib/utils";

type SaleDoneProps = {
  orderId: string;
  receiptNumber: number;
  total: number;
  change: number;
  money: (minor: number) => string;
  onNewSale: () => void;
  onVoid: () => void;
};

export default function SaleDone({ orderId, receiptNumber, total, change, money, onNewSale, onVoid }: SaleDoneProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <Card className="flex w-full max-w-[24em] flex-col items-center gap-5 p-6">
        <div className="flex flex-col items-center gap-2">
          <h2>Sale complete</h2>
          <span className="caption-style text-soft">Receipt #{receiptNumber}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[28px] leading-none font-semibold tabular-nums">{money(total)}</span>
          <span className="caption-style text-soft">Paid</span>
        </div>
        {change > 0 && <span className="h1-style text-warning tabular-nums">Change due {money(change)}</span>}
        <div className="flex w-full flex-wrap justify-center gap-2">
          <a href={`/receipts/${orderId}?print=1`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "secondary", size: "md" }), "min-h-11 flex-1")}>
            Print receipt
          </a>
          <Button variant="primary" size="md" className="min-h-11 flex-1" onClick={onNewSale} autoFocus>
            New sale
          </Button>
        </div>
      </Card>
      <Button variant="ghost" size="md" className="min-h-11" onClick={onVoid}>
        Void sale
      </Button>
    </div>
  );
}
