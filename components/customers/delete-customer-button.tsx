"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import { deleteCustomer } from "@/lib/customers/actions";

export default function DeleteCustomerButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    setError(null);
    try {
      const result = await deleteCustomer(id);
      if (result.ok) {
        setOpen(false);
        router.push("/customers");
      } else {
        setError(result.error);
      }
    } catch {
      setError("Couldn't reach the server. Check the connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="md">Delete customer</Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-4 p-6">
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>This can&apos;t be undone. Customers with sales can&apos;t be deleted.</DialogDescription>
          </DialogHeader>
          {error && <span role="alert" className="caption-style text-danger">{error}</span>}
          <DialogFooter>
            <Button variant="primary" size="md" disabled={pending} onClick={remove}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
