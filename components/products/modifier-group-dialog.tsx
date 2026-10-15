"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Checkbox } from "@/components/_ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import { saveModifierGroup } from "@/lib/catalog/modifier-actions";
import type { ModifierGroupFormInput } from "@/lib/catalog/modifier-form";
import { formatAmount } from "@/lib/money";

export type ModifierGroupRow = {
  id: string;
  name: string;
  min_choices: number;
  max_choices: number;
  active: boolean;
  modifier_options: { id: string; name: string; price_delta: number; active: boolean; sort_order: number }[];
  product_modifier_groups: { product_id: string }[];
};

type ModifierGroupDialogProps = { group?: ModifierGroupRow; currency: string; trigger: ReactNode };

function toInput(group: ModifierGroupRow | undefined, currency: string): ModifierGroupFormInput {
  if (!group) {
    return { name: "", min: "0", max: "1", active: true, options: [{ name: "", price: "", active: true }, { name: "", price: "", active: true }] };
  }
  return {
    id: group.id,
    name: group.name,
    min: String(group.min_choices),
    max: String(group.max_choices),
    active: group.active,
    options: [...group.modifier_options]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((option) => ({ id: option.id, name: option.name, price: option.price_delta === 0 ? "" : formatAmount(option.price_delta, currency), active: option.active })),
  };
}

function GroupForm({ group, currency, onSaved }: { group?: ModifierGroupRow; currency: string; onSaved: () => void }) {
  const [values, setValues] = useState<ModifierGroupFormInput>(() => toInput(group, currency));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setOption(index: number, patch: Partial<ModifierGroupFormInput["options"][number]>) {
    setValues((current) => ({ ...current, options: current.options.map((option, i) => (i === index ? { ...option, ...patch } : option)) }));
  }

  function moveOption(index: number, direction: -1 | 1) {
    setValues((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.options.length) return current;
      const options = [...current.options];
      [options[index], options[target]] = [options[target], options[index]];
      return { ...current, options };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await saveModifierGroup(values);
      if (result.ok) onSaved();
      else {
        setErrors(result.errors ?? {});
        setError(result.error ?? null);
      }
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>{group ? `Edit ${group.name}` : "New modifier group"}</DialogTitle>
        <DialogDescription>Min 1 and max 1 makes a required pick-one group. Leave min at 0 for optional extras.</DialogDescription>
      </DialogHeader>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
      <Field label="Name" htmlFor="mg-name" error={errors.name}>
        <Input id="mg-name" value={values.name} maxLength={60} onChange={(event) => setValues({ ...values, name: event.target.value })} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Min choices" htmlFor="mg-min" error={errors.min}>
          <Input id="mg-min" inputMode="numeric" value={values.min} onChange={(event) => setValues({ ...values, min: event.target.value })} />
        </Field>
        <Field label="Max choices" htmlFor="mg-max" error={errors.max}>
          <Input id="mg-max" inputMode="numeric" value={values.max} onChange={(event) => setValues({ ...values, max: event.target.value })} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="eyebrow-style text-soft mb-2 font-normal">Options</legend>
        {errors.options && <span role="alert" className="caption-style text-danger">{errors.options}</span>}
        {values.options.map((option, index) => (
          <div key={option.id ?? `new-${index}`} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label={`Option name ${index + 1}`} className="min-w-[8em] flex-1" maxLength={60} value={option.name} onChange={(event) => setOption(index, { name: event.target.value })} />
              <Input aria-label={`Price change ${index + 1}`} placeholder="0.00" inputMode="decimal" className="w-[6em]" value={option.price} onChange={(event) => setOption(index, { price: event.target.value })} />
              <Checkbox aria-label={`Option ${index + 1} active`} checked={option.active} onCheckedChange={(checked) => setOption(index, { active: checked === true })} />
              <Button type="button" variant="ghost" size="sm" aria-label={`Move option ${index + 1} up`} disabled={index === 0} onClick={() => moveOption(index, -1)}>↑</Button>
              <Button type="button" variant="ghost" size="sm" aria-label={`Move option ${index + 1} down`} disabled={index === values.options.length - 1} onClick={() => moveOption(index, 1)}>↓</Button>
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove option ${index + 1}`} onClick={() => setValues({ ...values, options: values.options.filter((_, i) => i !== index) })}>
                Remove
              </Button>
            </div>
            {(errors[`option-${index}`] || errors[`price-${index}`]) && (
              <span role="alert" className="caption-style text-danger">{errors[`option-${index}`] ?? errors[`price-${index}`]}</span>
            )}
          </div>
        ))}
        <Button type="button" variant="secondary" size="md" className="self-start" onClick={() => setValues({ ...values, options: [...values.options, { name: "", price: "", active: true }] })}>
          Add option
        </Button>
      </fieldset>
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" disabled={pending}>{pending ? "Saving…" : "Save group"}</Button>
      </DialogFooter>
    </form>
  );
}

export default function ModifierGroupDialog({ group, currency, trigger }: ModifierGroupDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-[36em]">
        <GroupForm
          key={openCount}
          group={group}
          currency={currency}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
