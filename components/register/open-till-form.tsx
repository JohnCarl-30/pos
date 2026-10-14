"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import FormMessage from "@/components/_common/form-message";
import { openTill } from "@/lib/register/actions";
import type { ActionResult } from "@/lib/action-result";

type OpenTillFormProps = { registerId: string; registerName: string; currency: string };

export default function OpenTillForm({ registerId, registerName, currency }: OpenTillFormProps) {
  const [cash, setCash] = useState("");
  const [state, action, pending] = useActionState<ActionResult, FormData>(openTill, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="mx-auto flex w-full max-w-[24em] flex-col gap-4 p-6">
      <h2>Open {registerName}</h2>
      <span className="caption-style text-subtle">Count the cash in the drawer before your first sale.</span>
      <FormMessage result={state && !state.ok && state.error ? state : null} />
      <input type="hidden" name="registerId" value={registerId} />
      <Field label={`Starting cash (${currency})`} htmlFor="opening-cash" error={fieldErrors?.openingCash}>
        <Input id="opening-cash" name="openingCash" inputMode="decimal" className="min-h-11" placeholder="100.00" value={cash} onChange={(event) => setCash(event.target.value)} required />
      </Field>
      <Button type="submit" variant="primary" size="md" className="min-h-11" disabled={pending}>
        {pending ? "Opening…" : "Open till"}
      </Button>
    </form>
  );
}
