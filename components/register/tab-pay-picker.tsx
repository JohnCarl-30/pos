"use client";

import Button from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import type { RegisterProduct } from "@/lib/register/cart";
import { leftToPay, lineChoices, type PayPick, type TabLine } from "@/lib/tabs/lines";

type TabPayPickerProps = {
  label: string;
  lines: TabLine[];
  products: RegisterProduct[];
  pick: PayPick;
  missing: string[];
  onPick: (line: TabLine, quantity: number) => void;
  onAll: () => void;
  onNone: () => void;
};

export default function TabPayPicker({ label, lines, products, pick, missing, onPick, onAll, onNone }: TabPayPickerProps) {
  const open = lines.filter((line) => leftToPay(line) > 0);
  return (
    <div className="flex flex-col">
      <div className="border-line-strong flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <h2>Paying {label}</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" className="min-h-11" onClick={onAll}>Select all</Button>
          <Button variant="ghost" size="md" className="min-h-11" onClick={onNone}>Select none</Button>
        </div>
      </div>
      {missing.length > 0 && (
        <span role="status" className="caption-style text-warning px-3 pt-3">
          {missing.join(", ")} {missing.length === 1 ? "isn't" : "aren't"} for sale any more. Void {missing.length === 1 ? "it" : "them"} on the tab to finish paying.
        </span>
      )}
      {open.length === 0 ? (
        <span className="caption-style text-subtle block p-4">Nothing left to pay on this tab.</span>
      ) : (
        <ul className="divide-line-strong divide-y">
          {open.map((line) => {
            const left = leftToPay(line);
            const picked = pick[line.id] ?? 0;
            const choices = lineChoices(line, products);
            return (
              <li key={line.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <Checkbox aria-label={`Pay ${line.name}`} checked={picked > 0} onCheckedChange={(checked) => onPick(line, checked === true ? left : 0)} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{line.name}</span>
                  {choices && <span className="caption-style text-soft">{choices}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="md" className="min-h-11 min-w-11" aria-label={`Pay one less ${line.name}`} disabled={picked === 0} onClick={() => onPick(line, picked - 1)}>−</Button>
                  <span className="min-w-14 text-center tabular-nums" aria-label={`Paying ${picked} of ${left} ${line.name}`}>{picked} of {left}</span>
                  <Button variant="secondary" size="md" className="min-h-11 min-w-11" aria-label={`Pay one more ${line.name}`} disabled={picked >= left} onClick={() => onPick(line, picked + 1)}>+</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
