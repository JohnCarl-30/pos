"use client";

import { useActionState, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import FormMessage from "@/components/_common/form-message";
import { completeSetup } from "@/lib/setup/actions";
import { SETUP_STEPS } from "@/lib/setup/steps";
import type { ActionResult } from "@/lib/action-result";

function subscribeToNothing() {
  return () => {};
}

function getClientTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getServerTimeZone(): string {
  return "UTC";
}

type FormValues = {
  businessName: string;
  storeName: string;
  currency: string;
  pricing: string;
  taxRate: string;
  ownerName: string;
  email: string;
  password: string;
};

const INITIAL_VALUES: FormValues = {
  businessName: "",
  storeName: "",
  currency: "",
  pricing: "exclusive",
  taxRate: "0",
  ownerName: "",
  email: "",
  password: "",
};

export default function SetupWizard() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(completeSetup, null);
  const [step, setStep] = useState(0);
  const [prevState, setPrevState] = useState(state);
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const timezone = useSyncExternalStore(subscribeToNothing, getClientTimeZone, getServerTimeZone);
  const steps = useRef<(HTMLFieldSetElement | null)[]>([]);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  if (state !== prevState) {
    setPrevState(state);
    const firstBad = fieldErrors ? SETUP_STEPS.findIndex((s) => s.fields.some((field) => field in fieldErrors)) : -1;
    if (firstBad !== -1) setStep(firstBad);
  }

  function update(key: keyof FormValues) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setValues((current) => ({ ...current, [key]: next }));
    };
  }

  function next() {
    const inputs = steps.current[step]?.querySelectorAll("input") ?? [];
    for (const input of inputs) {
      if (!input.reportValidity()) return;
    }
    setStep((current) => current + 1);
  }

  const last = step === SETUP_STEPS.length - 1;

  return (
    <form action={action} className="flex flex-col gap-6">
      <span className="caption-style text-subtle block">
        Step {step + 1} of {SETUP_STEPS.length} · {SETUP_STEPS[step].title}
      </span>
      <FormMessage result={state} />

      <fieldset
        ref={(el) => {
          steps.current[0] = el;
        }}
        hidden={step !== 0}
        className="flex flex-col gap-4"
      >
        <Field label="Business name" htmlFor="businessName" error={fieldErrors?.businessName}>
          <Input
            id="businessName"
            name="businessName"
            required
            maxLength={120}
            autoFocus
            value={values.businessName}
            onChange={update("businessName")}
          />
        </Field>
      </fieldset>

      <fieldset
        ref={(el) => {
          steps.current[1] = el;
        }}
        hidden={step !== 1}
        className="flex flex-col gap-4"
      >
        <Field label="Store name" htmlFor="storeName" error={fieldErrors?.storeName}>
          <Input id="storeName" name="storeName" required maxLength={120} value={values.storeName} onChange={update("storeName")} />
        </Field>
        <Field label="Currency" htmlFor="currency" hint="3-letter code, like USD, EUR or PHP" error={fieldErrors?.currency}>
          <Input
            id="currency"
            name="currency"
            required
            minLength={3}
            maxLength={3}
            className="uppercase"
            value={values.currency}
            onChange={update("currency")}
          />
        </Field>
        <Field label="Prices on your menu or shelf" htmlFor="pricing">
          <Select
            name="pricing"
            value={values.pricing}
            onValueChange={(value) => setValues((current) => ({ ...current, pricing: value }))}
          >
            <SelectTrigger id="pricing">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exclusive">Tax is added at checkout</SelectItem>
              <SelectItem value="inclusive">Prices already include tax</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Standard tax rate (%)" htmlFor="taxRate" hint="Use 0 if you don't charge tax" error={fieldErrors?.taxRate}>
          <Input id="taxRate" name="taxRate" inputMode="decimal" required value={values.taxRate} onChange={update("taxRate")} />
        </Field>
        <input type="hidden" name="timezone" value={timezone} />
      </fieldset>

      <fieldset
        ref={(el) => {
          steps.current[2] = el;
        }}
        hidden={step !== 2}
        className="flex flex-col gap-4"
      >
        <Field label="Your name" htmlFor="ownerName" error={fieldErrors?.ownerName}>
          <Input
            id="ownerName"
            name="ownerName"
            required
            maxLength={120}
            autoComplete="name"
            value={values.ownerName}
            onChange={update("ownerName")}
          />
        </Field>
        <Field label="Email" htmlFor="email" error={fieldErrors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={values.email}
            onChange={update("email")}
          />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters" error={fieldErrors?.password}>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={values.password}
            onChange={update("password")}
          />
        </Field>
      </fieldset>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="md"
          onClick={() => setStep((current) => current - 1)}
          disabled={step === 0}
          className={step === 0 ? "invisible" : undefined}
        >
          Back
        </Button>
        {last ? (
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Setting up…" : "Finish setup"}
          </Button>
        ) : (
          <Button variant="primary" size="md" onClick={next}>
            Continue
          </Button>
        )}
      </div>
    </form>
  );
}
