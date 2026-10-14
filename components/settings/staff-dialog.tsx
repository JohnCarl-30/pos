"use client";

import { useActionState, useState, type ReactNode } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import { Checkbox } from "@/components/_ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import FormMessage from "@/components/_common/form-message";
import { createStaff, updateStaff } from "@/lib/settings/staff-actions";
import type { ActionResult } from "@/lib/action-result";
import type { StaffRole } from "@/lib/auth/roles";
import type { StaffRow } from "./staff-table";

type StaffDialogProps = {
  member?: StaffRow;
  stores: { id: string; name: string }[];
  trigger: ReactNode;
};

type StaffFormValues = {
  name: string;
  email: string;
  password: string;
  role: StaffRole;
  storeIds: string[];
  active: boolean;
};

const ROLE_HINTS: Record<StaffRole, string> = {
  cashier: "Sells and looks up orders and customers.",
  manager: "Also manages products, stock, refunds and reports.",
  owner: "Full access to every store and to Settings.",
};

function valuesFromMember(member: StaffRow | undefined): StaffFormValues {
  return {
    name: member?.name ?? "",
    email: member?.email ?? "",
    password: "",
    role: member?.role ?? "cashier",
    storeIds: member ? [...member.storeIds] : [],
    active: member?.active ?? true,
  };
}

export default function StaffDialog({ member, stores, trigger }: StaffDialogProps) {
  const [open, setOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <StaffDialogForm key={openCount} member={member} stores={stores} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type StaffDialogFormProps = {
  member?: StaffRow;
  stores: { id: string; name: string }[];
  onSaved: () => void;
};

function StaffDialogForm({ member, stores, onSaved }: StaffDialogFormProps) {
  const baseAction = member ? updateStaff : createStaff;
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prevState, formData) => {
    const result = await baseAction(prevState, formData);
    if (result?.ok) onSaved();
    return result;
  }, null);
  const [values, setValues] = useState<StaffFormValues>(() => valuesFromMember(member));
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>{member ? `Edit ${member.name}` : "Add staff member"}</DialogTitle>
        <DialogDescription>
          {member ? member.email : "Share the temporary password with them. They can change it from the sign-in page."}
        </DialogDescription>
      </DialogHeader>
      <FormMessage result={state && !state.ok ? state : null} />
      {member ? (
        <input type="hidden" name="id" value={member.id} />
      ) : (
        <>
          <Field label="Name" htmlFor="staff-name" error={fieldErrors?.name}>
            <Input
              id="staff-name"
              name="name"
              required
              maxLength={120}
              value={values.name}
              onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>
          <Field label="Email" htmlFor="staff-email" error={fieldErrors?.email}>
            <Input
              id="staff-email"
              name="email"
              type="email"
              required
              value={values.email}
              onChange={(event) => setValues((current) => ({ ...current, email: event.target.value }))}
            />
          </Field>
          <Field label="Temporary password" htmlFor="staff-password" hint="At least 8 characters" error={fieldErrors?.password}>
            <Input
              id="staff-password"
              name="password"
              type="text"
              required
              minLength={8}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="off"
              value={values.password}
              onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))}
            />
          </Field>
        </>
      )}
      <Field label="Role" htmlFor="staff-role" hint={ROLE_HINTS[values.role]}>
        <Select
          name="role"
          value={values.role}
          onValueChange={(value) => setValues((current) => ({ ...current, role: value as StaffRole }))}
        >
          <SelectTrigger id="staff-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cashier">Cashier</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {values.role !== "owner" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="caption-style text-soft mb-2">Stores they work in</legend>
          {stores.map((store) => (
            <div key={store.id} className="flex items-center gap-2">
              <Checkbox
                id={`store-${store.id}`}
                name="storeIds"
                value={store.id}
                checked={values.storeIds.includes(store.id)}
                onCheckedChange={(checked) =>
                  setValues((current) => ({
                    ...current,
                    storeIds: checked === true ? [...current.storeIds, store.id] : current.storeIds.filter((id) => id !== store.id),
                  }))
                }
              />
              <Label htmlFor={`store-${store.id}`}>{store.name}</Label>
            </div>
          ))}
          {fieldErrors?.storeIds && <span role="alert" className="caption-style text-danger">{fieldErrors.storeIds}</span>}
        </fieldset>
      )}
      {member && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="staff-active"
            name="active"
            checked={values.active}
            onCheckedChange={(checked) => setValues((current) => ({ ...current, active: checked === true }))}
          />
          <Label htmlFor="staff-active">Can sign in</Label>
        </div>
      )}
      <DialogFooter>
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? "Saving…" : member ? "Save changes" : "Add staff member"}
        </Button>
      </DialogFooter>
    </form>
  );
}
