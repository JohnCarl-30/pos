"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import FormMessage from "@/components/_common/form-message";
import { saveTaxClass, setDefaultTaxClass } from "@/lib/settings/tax-actions";
import type { ActionResult } from "@/lib/action-result";

type TaxClass = { id: string; name: string; is_default: boolean };

function MakeDefault({ taxClass }: { taxClass: TaxClass }) {
  const [, action, pending] = useActionState<ActionResult, FormData>(setDefaultTaxClass, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={taxClass.id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>Make default</Button>
    </form>
  );
}

export default function TaxClasses({ classes }: { classes: TaxClass[] }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveTaxClass, null);
  const [prevState, setPrevState] = useState(state);
  const [name, setName] = useState("");
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  if (state !== prevState) {
    setPrevState(state);
    if (state?.ok) setName("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2>Tax classes</h2>
        <p className="text-subtle max-w-[40em]">Each product belongs to one class. New products use the default class. Each store sets its own rate per class below.</p>
      </div>
      <ul className="divide-line-strong border-line-strong divide-y rounded-lg border">
        {classes.map((taxClass) => (
          <li key={taxClass.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span>
              {taxClass.name}
              {taxClass.is_default && <span className="caption-style text-subtle"> · default</span>}
            </span>
            {!taxClass.is_default && <MakeDefault taxClass={taxClass} />}
          </li>
        ))}
      </ul>
      <form action={action} className="flex items-end gap-2">
        <Field label="New tax class" htmlFor="tax-class-name" error={fieldErrors?.name} className="flex-1">
          <Input
            id="tax-class-name"
            name="name"
            required
            maxLength={60}
            placeholder="Food"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary" size="md" disabled={pending}>Add class</Button>
      </form>
      <FormMessage result={state && !state.ok && state.error ? state : null} />
    </div>
  );
}
