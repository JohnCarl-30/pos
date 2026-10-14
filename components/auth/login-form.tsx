"use client";

import { useActionState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import FormMessage from "@/components/_common/form-message";
import { signIn } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/action-result";

type LoginFormProps = { next?: string; notice?: string };

export default function LoginForm({ next, notice }: LoginFormProps) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(signIn, notice ? { ok: false, error: notice } : null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <FormMessage result={state} />
      <Field label="Email" htmlFor="email" error={fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(fieldErrors?.email)} />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={fieldErrors?.password}
        trailing={
          <Button href="/forgot-password" variant="link" size="none" className="caption-style">
            Forgot password?
          </Button>
        }
      >
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(fieldErrors?.password)} />
      </Field>
      <Button type="submit" variant="primary" size="md" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
