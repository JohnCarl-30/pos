"use client";

import { useActionState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import FormMessage from "@/components/_common/form-message";
import { requestPasswordReset } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/action-result";

export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(requestPasswordReset, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage result={state} />
      <Field label="Email" htmlFor="email" error={fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" variant="primary" size="md" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <Button href="/login" variant="link" size="none" className="caption-style self-center">
        Back to sign in
      </Button>
    </form>
  );
}
