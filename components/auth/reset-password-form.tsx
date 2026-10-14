"use client";

import { useActionState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import FormMessage from "@/components/_common/form-message";
import { updatePassword } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/action-result";

export default function ResetPasswordForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(updatePassword, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage result={state} />
      <Field label="New password" htmlFor="password" hint="At least 8 characters" error={fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" variant="primary" size="md" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
