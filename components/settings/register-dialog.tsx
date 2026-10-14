"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import FormMessage from "@/components/_common/form-message";
import { createRegister } from "@/lib/settings/store-actions";
import type { ActionResult } from "@/lib/action-result";

export default function RegisterDialog({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [open, setOpen] = useState(false);
  const wasOpen = useRef(false);
  const [state, action, pending] = useActionState<ActionResult, FormData>(createRegister, null);
  const [prevState, setPrevState] = useState(state);
  const [name, setName] = useState("");
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    if (open && !wasOpen.current) setName("");
    wasOpen.current = open;
  }, [open]);

  if (state !== prevState) {
    setPrevState(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Add register
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="flex flex-col gap-4 p-6">
          <DialogHeader>
            <DialogTitle>Add register</DialogTitle>
            <DialogDescription>A register is one checkout counter or device in {storeName}.</DialogDescription>
          </DialogHeader>
          <FormMessage result={state && !state.ok ? state : null} />
          <input type="hidden" name="storeId" value={storeId} />
          <Field label="Name" htmlFor="register-name" error={fieldErrors?.name}>
            <Input
              id="register-name"
              name="name"
              required
              maxLength={60}
              placeholder="Counter 2"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? "Adding…" : "Add register"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
