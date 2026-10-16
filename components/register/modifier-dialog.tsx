"use client";

import { useState } from "react";
import Button from "@/components/_ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { checkSelection, groupRule, selectionDelta, toggleOption, type Selection } from "@/lib/modifiers";
import { variantLabel, type RegisterProduct, type RegisterVariant } from "@/lib/register/cart";

export type ModifierTarget = { product: RegisterProduct; variant: RegisterVariant; selection: Selection; editKey: string | null };

type ModifierDialogProps = {
  target: ModifierTarget | null;
  money: (minor: number) => string;
  onDone: (target: ModifierTarget, selection: Selection) => void;
  onClose: () => void;
  addLabel?: string;
};

function ModifierForm({ target, money, onDone, addLabel }: { target: ModifierTarget; money: (minor: number) => string; onDone: ModifierDialogProps["onDone"]; addLabel: string }) {
  const [selection, setSelection] = useState<Selection>(target.selection);
  const groups = target.product.modifierGroups;
  const label = variantLabel(target.product, target.variant);
  const problem = checkSelection(groups, selection, label);
  const each = target.variant.price + selectionDelta(groups, selection);

  return (
    <div className="flex flex-col gap-5 p-6">
      <DialogHeader>
        <DialogTitle>{label}</DialogTitle>
        <DialogDescription className="tabular-nums">{money(each)} each</DialogDescription>
      </DialogHeader>
      {groups.map((group) => (
        <fieldset key={group.id} className="flex flex-col gap-2">
          <legend className="mb-2 flex items-baseline gap-2">
            <span className="lead-style">{group.name}</span>
            <span className="caption-style text-soft">
              {groupRule(group.min, group.max)}
              {group.min > 0 ? " · required" : ""}
            </span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {group.options.map((option) => {
              const on = (selection[group.id] ?? []).includes(option.id);
              return (
                <Button
                  key={option.id}
                  variant="secondary"
                  size="md"
                  aria-pressed={on}
                  className="aria-pressed:bg-primary aria-pressed:text-primary-foreground min-h-11 justify-between"
                  onClick={() => setSelection((current) => toggleOption(group, current, option.id))}
                >
                  <span>{option.name}</span>
                  {option.priceDelta !== 0 && (
                    <span className="tabular-nums">
                      {option.priceDelta > 0 ? "+" : "−"}
                      {money(Math.abs(option.priceDelta))}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </fieldset>
      ))}
      {problem && <span role="status" className="caption-style text-soft">{problem}.</span>}
      <DialogFooter>
        <Button variant="primary" size="md" className="min-h-11" disabled={problem !== null} onClick={() => onDone(target, selection)}>
          {target.editKey ? "Save choices" : addLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}

export default function ModifierDialog({ target, money, onDone, onClose, addLabel = "Add to sale" }: ModifierDialogProps) {
  const open = target !== null;
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-[32em]">{target && <ModifierForm key={openCount} target={target} money={money} onDone={onDone} addLabel={addLabel} />}</DialogContent>
    </Dialog>
  );
}
