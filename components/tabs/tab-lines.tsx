"use client";

import { useId } from "react";
import Button from "@/components/_ui/button";
import { lineChoices, lineUnitPrice, type TabLine } from "@/lib/tabs/lines";
import type { RegisterProduct } from "@/lib/register/cart";
import { cn } from "@/lib/utils";

type TabLinesProps = {
  lines: TabLine[];
  products: RegisterProduct[];
  editable: boolean;
  pending: boolean;
  money: (minor: number) => string;
  time: (iso: string) => string;
  onQuantity: (line: TabLine, quantity: number) => void;
  onNote: (line: TabLine) => void;
  onVoid: (line: TabLine) => void;
};

function Line({ line, props }: { line: TabLine; props: TabLinesProps }) {
  const unit = lineUnitPrice(line, props.products);
  const choices = lineChoices(line, props.products);
  const sent = line.sentAt !== null;
  const voided = line.voidedAt !== null;
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className={cn("flex min-w-0 flex-col gap-1", voided && "text-subtle line-through")}>
          <span className="truncate">
            {line.quantity} × {line.name}
          </span>
          {choices && <span className="caption-style text-soft">{choices}</span>}
          {line.note && <span className="caption-style text-soft italic">{line.note}</span>}
        </div>
        <span className="tabular-nums">{unit === null ? "—" : props.money(unit * line.quantity)}</span>
      </div>
      {!voided && unit === null && line.paidQuantity < line.quantity && (
        <span className="caption-style text-warning">No longer for sale. {sent ? "Void it" : "Remove it"} so the tab can be paid.</span>
      )}
      {voided ? (
        <span className="caption-style text-danger">Voided · {line.voidReason}</span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {sent && <span className="caption-style text-soft">Sent {props.time(line.sentAt!)}</span>}
          {line.paidQuantity > 0 && <span className="caption-style text-soft">{line.paidQuantity} of {line.quantity} paid</span>}
          {props.editable && !sent && (
            <>
              <Button variant="secondary" size="md" className="min-h-11 min-w-11" aria-label={`One less ${line.name}`} disabled={props.pending} onClick={() => props.onQuantity(line, line.quantity - 1)}>−</Button>
              <Button variant="secondary" size="md" className="min-h-11 min-w-11" aria-label={`One more ${line.name}`} disabled={props.pending} onClick={() => props.onQuantity(line, line.quantity + 1)}>+</Button>
              <Button variant="ghost" size="md" className="ml-auto min-h-11" aria-label={`Note for ${line.name}`} onClick={() => props.onNote(line)}>Note</Button>
              <Button variant="ghost" size="md" className="min-h-11" aria-label={`Remove ${line.name}`} disabled={props.pending} onClick={() => props.onQuantity(line, 0)}>Remove</Button>
            </>
          )}
          {props.editable && sent && line.paidQuantity === 0 && (
            <Button variant="ghost" size="md" className="ml-auto min-h-11" aria-label={`Void ${line.name}`} onClick={() => props.onVoid(line)}>Void…</Button>
          )}
        </div>
      )}
    </li>
  );
}

export default function TabLines(props: TabLinesProps) {
  const id = useId();
  const unsent = props.lines.filter((line) => line.sentAt === null);
  const sent = props.lines.filter((line) => line.sentAt !== null);
  if (props.lines.length === 0) return <span className="caption-style text-subtle block p-4">Tap a product to add it to the tab.</span>;
  const unsentId = `${id}-unsent`;
  const sentId = `${id}-sent`;
  return (
    <div className="flex flex-col">
      {unsent.length > 0 && (
        <section aria-labelledby={unsentId}>
          <h3 id={unsentId} className="caption-style text-soft px-4 pt-3 uppercase">Not sent yet</h3>
          <ul className="divide-line-strong divide-y">{unsent.map((line) => <Line key={line.id} line={line} props={props} />)}</ul>
        </section>
      )}
      {sent.length > 0 && (
        <section aria-labelledby={sentId}>
          <h3 id={sentId} className="caption-style text-soft px-4 pt-3 uppercase">Sent</h3>
          <ul className="divide-line-strong divide-y">{sent.map((line) => <Line key={line.id} line={line} props={props} />)}</ul>
        </section>
      )}
    </div>
  );
}
