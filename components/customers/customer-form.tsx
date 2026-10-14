"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import FormMessage from "@/components/_common/form-message";
import { saveCustomer } from "@/lib/customers/actions";
import type { ActionResult } from "@/lib/action-result";

type CustomerFormProps = { customer?: { id: string; name: string; email: string | null; phone: string | null; notes: string | null } };

export default function CustomerForm({ customer }: CustomerFormProps) {
  const [values, setValues] = useState({ name: customer?.name ?? "", email: customer?.email ?? "", phone: customer?.phone ?? "", notes: customer?.notes ?? "" });
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveCustomer, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex w-full max-w-[32em] flex-col gap-4">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <FormMessage result={state} />
      <Field label="Name" htmlFor="customer-name" error={errors?.name}>
        <Input id="customer-name" name="name" maxLength={120} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required />
      </Field>
      <Field label="Email" htmlFor="customer-email" error={errors?.email}>
        <Input id="customer-email" name="email" type="email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} />
      </Field>
      <Field label="Phone" htmlFor="customer-phone" error={errors?.phone}>
        <Input id="customer-phone" name="phone" maxLength={40} value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} />
      </Field>
      <Field label="Notes" htmlFor="customer-notes" error={errors?.notes}>
        <textarea
          id="customer-notes"
          name="notes"
          maxLength={1000}
          rows={4}
          className="border-line-strong focus-visible:ring-ring/60 rounded-lg border bg-transparent px-3 py-2 outline-none focus-visible:ring-2"
          value={values.notes}
          onChange={(event) => setValues({ ...values, notes: event.target.value })}
        />
      </Field>
      <Button type="submit" variant="primary" size="md" className="self-start" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
