"use client";

import Button from "@/components/_ui/button";
import Tag from "@/components/_ui/tag";
import Card from "@/components/_common/card";
import { ticketMinutes, ticketTone } from "@/lib/kitchen/tone";
import type { KitchenTicket } from "@/lib/kitchen/queries";
import { cn } from "@/lib/utils";

const TONE = { normal: "text-soft", late: "text-warning", overdue: "text-danger" } as const;

type TicketCardProps = { ticket: KitchenTicket; now: number | null; time: (iso: string) => string; pending: boolean; onDone: () => void };

export default function TicketCard({ ticket, now, time, pending, onDone }: TicketCardProps) {
  const minutes = now === null ? null : ticketMinutes(ticket.sentAt, now);
  const tone = minutes === null ? "normal" : ticketTone(minutes);
  return (
    <Card role="article" aria-label={`Ticket ${ticket.number}, ${ticket.label}`} className={cn("flex flex-col gap-3", tone === "overdue" && "ring-danger ring-2")}>
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-[24px] leading-none font-bold">{ticket.label}</span>
          <span className="caption-style text-soft">#{ticket.number} · {time(ticket.sentAt)}</span>
        </div>
        <span className={cn("text-[20px] leading-none font-semibold tabular-nums", TONE[tone])}>{minutes === null ? "" : `${minutes}m`}</span>
      </header>
      <ul className="flex flex-col gap-2">
        {ticket.items.map((item) => (
          <li key={item.id} className={cn("flex flex-col", item.voided && "text-subtle line-through")}>
            <span className="flex items-center gap-2 text-[18px]">
              {item.quantity} × {item.name}
              {item.voided && <Tag tone="red" size="sm" className="no-underline">VOID</Tag>}
            </span>
            {item.choices && <span className="pl-4 font-bold">{item.choices}</span>}
            {item.note && <span className="pl-4 italic">{item.note}</span>}
          </li>
        ))}
      </ul>
      <Button variant="primary" size="md" className="mt-auto min-h-12" disabled={pending} onClick={onDone}>
        Done
      </Button>
    </Card>
  );
}
