"use client";

import { useRef, useState, type FormEvent } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/_ui/dialog";
import { addCustomer, searchCustomers } from "@/lib/register/actions";

type Customer = { id: string; name: string; email: string | null; phone: string | null };
type CustomerDialogProps = { open: boolean; onOpenChange: (open: boolean) => void; onPick: (customer: { id: string; name: string }) => void };

function CustomerForm({ onPick }: Pick<CustomerDialogProps, "onPick">) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [draft, setDraft] = useState({ name: "", email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => setResults(await searchCustomers(value)), 250);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await addCustomer(draft);
    if (result.ok) onPick(result.customer);
    else setError(result.error);
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <DialogHeader>
        <DialogTitle>Add a customer</DialogTitle>
        <DialogDescription>Search by name, email or phone, or add someone new.</DialogDescription>
      </DialogHeader>
      <Input aria-label="Search customers" className="min-h-11" placeholder="Search customers" value={query} onChange={(event) => search(event.target.value)} autoFocus />
      {results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((customer) => (
            <li key={customer.id}>
              <Button variant="ghost" size="md" className="min-h-11 w-full justify-between" onClick={() => onPick({ id: customer.id, name: customer.name })}>
                <span>{customer.name}</span>
                <span className="caption-style text-subtle">{customer.email ?? customer.phone ?? ""}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={create} className="border-line-strong flex flex-col gap-3 border-t pt-4">
        <span className="lead-style">New customer</span>
        {error && <span role="alert" className="caption-style text-danger">{error}</span>}
        <Field label="Name" htmlFor="customer-name">
          <Input id="customer-name" className="min-h-11" maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
        </Field>
        <Field label="Email (optional)" htmlFor="customer-email">
          <Input id="customer-email" type="email" className="min-h-11" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
        </Field>
        <Field label="Phone (optional)" htmlFor="customer-phone">
          <Input id="customer-phone" className="min-h-11" maxLength={40} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
        </Field>
        <Button type="submit" variant="secondary" size="md" className="min-h-11">
          Add and attach
        </Button>
      </form>
    </div>
  );
}

export default function CustomerDialog({ open, onOpenChange, onPick }: CustomerDialogProps) {
  const [prevOpen, setPrevOpen] = useState(open);
  const [openCount, setOpenCount] = useState(0);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpenCount((count) => count + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <CustomerForm key={openCount} onPick={onPick} />
      </DialogContent>
    </Dialog>
  );
}
