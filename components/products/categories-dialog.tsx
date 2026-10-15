"use client";

import { useActionState, useState, useTransition } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import FormMessage from "@/components/_common/form-message";
import { Checkbox } from "@/components/_ui/checkbox";
import { deleteCategory, moveCategory, saveCategory, setCategoryKitchen } from "@/lib/catalog/category-actions";
import type { ActionResult } from "@/lib/action-result";

type Category = { id: string; name: string; kitchen: boolean };

function CategoryRow({ category, index, last }: { category: Category; index: number; last: boolean }) {
  const [name, setName] = useState(category.name);
  const [prevName, setPrevName] = useState(category.name);
  const [saveState, saveAction, saving] = useActionState<ActionResult, FormData>(saveCategory, null);
  const [moveState, moveAction, moving] = useActionState<ActionResult, FormData>(moveCategory, null);
  const [deleteState, deleteAction, deleting] = useActionState<ActionResult, FormData>(deleteCategory, null);

  const [kitchen, setKitchen] = useState(category.kitchen);
  const [kitchenError, setKitchenError] = useState<string | null>(null);
  const [, startKitchen] = useTransition();

  function changeKitchen(next: boolean) {
    setKitchen(next);
    setKitchenError(null);
    startKitchen(async () => {
      const result = await setCategoryKitchen(category.id, next);
      if (!result?.ok) {
        setKitchen(!next);
        setKitchenError(result && !result.ok ? result.error ?? "Something went wrong. Try again." : "Something went wrong. Try again.");
      }
    });
  }

  if (category.name !== prevName) {
    setPrevName(category.name);
    setName(category.name);
  }

  const error = kitchenError ?? (saveState && !saveState.ok ? saveState.fieldErrors?.name ?? saveState.error : undefined) ?? (deleteState && !deleteState.ok ? deleteState.error : undefined) ?? (moveState && !moveState.ok ? moveState.error : undefined);

  return (
    <li className="flex flex-col gap-1 px-3 py-2">
      <div className="flex items-center gap-2">
        <form action={saveAction} className="flex flex-1 items-center gap-2">
          <input type="hidden" name="id" value={category.id} />
          <Input name="name" aria-label={`Name for ${category.name}`} value={name} onChange={(event) => setName(event.target.value)} maxLength={60} />
          <Button type="submit" variant="secondary" size="sm" disabled={saving || name.trim() === category.name}>Rename</Button>
        </form>
        <label className="caption-style text-soft flex items-center gap-1.5">
          <Checkbox aria-label={`${category.name} goes to the kitchen`} checked={kitchen} onCheckedChange={(checked) => changeKitchen(checked === true)} />
          Kitchen
        </label>
        <form action={moveAction}>
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="direction" value="-1" />
          <Button type="submit" variant="ghost" size="sm" disabled={moving || index === 0} aria-label={`Move ${category.name} up`}>↑</Button>
        </form>
        <form action={moveAction}>
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="direction" value="1" />
          <Button type="submit" variant="ghost" size="sm" disabled={moving || last} aria-label={`Move ${category.name} down`}>↓</Button>
        </form>
        <form action={deleteAction}>
          <input type="hidden" name="id" value={category.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={deleting}>Remove</Button>
        </form>
      </div>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
    </li>
  );
}

function AddCategoryForm() {
  const [name, setName] = useState("");
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, formData) => {
    const result = await saveCategory(prev, formData);
    if (result?.ok) setName("");
    return result;
  }, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <Field label="New category" htmlFor="new-category" error={state && !state.ok ? state.fieldErrors?.name : undefined} className="flex-1">
          <Input id="new-category" name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Drinks" />
        </Field>
        <Button type="submit" variant="primary" size="md" disabled={pending}>Add</Button>
      </div>
      <FormMessage result={state && !state.ok && state.error ? state : null} />
    </form>
  );
}

export default function CategoriesDialog({ categories }: { categories: Category[] }) {
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
        <Button variant="ghost" size="md">Categories</Button>
      </DialogTrigger>
      <DialogContent>
        <div key={openCount} className="flex flex-col gap-4 p-6">
          <DialogHeader>
            <DialogTitle>Categories</DialogTitle>
            <DialogDescription>The register groups products by category, in this order. Tick Kitchen for categories that print on kitchen tickets.</DialogDescription>
          </DialogHeader>
          {categories.length > 0 && (
            <ul className="divide-line-strong border-line-strong divide-y rounded-lg border">
              {categories.map((category, index) => (
                <CategoryRow key={category.id} category={category} index={index} last={index === categories.length - 1} />
              ))}
            </ul>
          )}
          <AddCategoryForm />
        </div>
      </DialogContent>
    </Dialog>
  );
}
