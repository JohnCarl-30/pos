"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import FormMessage from "@/components/_common/form-message";
import { saveStore } from "@/lib/settings/store-actions";
import type { ActionResult } from "@/lib/action-result";
import type { StoreWithRegisters } from "./stores-table";

type StoreDialogProps = { store?: StoreWithRegisters; trigger: ReactNode };

type PricingValue = "inclusive" | "exclusive";

type StoreFormValues = {
  name: string;
  address: string;
  currency: string;
  timezone: string;
  pricing: PricingValue;
};

function defaultTimeZone(): string {
  return typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
}

function valuesFromStore(store: StoreWithRegisters | undefined): StoreFormValues {
  return {
    name: store?.name ?? "",
    address: store?.address ?? "",
    currency: store?.currency ?? "",
    timezone: store?.timezone ?? defaultTimeZone(),
    pricing: store?.prices_include_tax ? "inclusive" : "exclusive",
  };
}

export default function StoreDialog({ store, trigger }: StoreDialogProps) {
  const [open, setOpen] = useState(false);
  const wasOpen = useRef(false);
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveStore, null);
  const [prevState, setPrevState] = useState(state);
  const [values, setValues] = useState<StoreFormValues>(() => valuesFromStore(store));
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    if (open && !wasOpen.current) setValues(valuesFromStore(store));
    wasOpen.current = open;
  }, [open, store]);

  if (state !== prevState) {
    setPrevState(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form action={action} className="flex flex-col gap-4 p-6">
          <DialogHeader>
            <DialogTitle>{store ? "Edit store" : "Add store"}</DialogTitle>
            <DialogDescription>Currency and tax pricing apply to every sale in this store.</DialogDescription>
          </DialogHeader>
          <FormMessage result={state && !state.ok ? state : null} />
          <input type="hidden" name="id" value={store?.id ?? ""} />
          <Field label="Name" htmlFor="store-name" error={fieldErrors?.name}>
            <Input
              id="store-name"
              name="name"
              required
              maxLength={120}
              value={values.name}
              onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>
          <Field label="Address" htmlFor="store-address" error={fieldErrors?.address}>
            <Input
              id="store-address"
              name="address"
              maxLength={300}
              value={values.address}
              onChange={(event) => setValues((current) => ({ ...current, address: event.target.value }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency" htmlFor="store-currency" error={fieldErrors?.currency}>
              <Input
                id="store-currency"
                name="currency"
                required
                minLength={3}
                maxLength={3}
                className="uppercase"
                value={values.currency}
                onChange={(event) => setValues((current) => ({ ...current, currency: event.target.value }))}
              />
            </Field>
            <Field label="Time zone" htmlFor="store-timezone" error={fieldErrors?.timezone}>
              <Input
                id="store-timezone"
                name="timezone"
                required
                value={values.timezone}
                onChange={(event) => setValues((current) => ({ ...current, timezone: event.target.value }))}
              />
            </Field>
          </div>
          <Field label="Prices" htmlFor="store-pricing">
            <Select
              name="pricing"
              value={values.pricing}
              onValueChange={(value) => setValues((current) => ({ ...current, pricing: value as PricingValue }))}
            >
              <SelectTrigger id="store-pricing">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exclusive">Tax is added at checkout</SelectItem>
                <SelectItem value="inclusive">Prices already include tax</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? "Saving…" : store ? "Save store" : "Add store"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
