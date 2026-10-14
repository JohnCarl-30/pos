"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/_ui/dialog";
import RefundPanel from "./refund-panel";
import type { RefundContext } from "@/lib/orders/detail";
import type { StaffRole } from "@/lib/auth/roles";

type RefundDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: RefundContext | null;
  sessionId: string;
  role: StaffRole;
  currency: string;
  onDone: () => void;
};

export default function RefundDialog({ open, onOpenChange, context, ...props }: RefundDialogProps) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[40em]">{context && <RefundPanel key={openCount} context={context} {...props} />}</DialogContent>
    </Dialog>
  );
}
