"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import FormMessage from "@/components/_common/form-message";
import { createRegister } from "@/lib/settings/store-actions";
import type { ActionResult } from "@/lib/action-result";

export default function RegisterDialog({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [open, setOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Add register
        </Button>
      </DialogTrigger>
      <DialogContent>
        <RegisterDialogForm key={openCount} storeId={storeId} storeName={storeName} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type RegisterDialogFormProps = { storeId: string; storeName: string; onSaved: () => void };

function RegisterDialogForm({ storeId, storeName, onSaved }: RegisterDialogFormProps) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prevState, formData) => {
    const result = await createRegister(prevState, formData);
    if (result?.ok) onSaved();
    return result;
  }, null);
  const [name, setName] = useState("");
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
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
  );
}
