"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import { Checkbox } from "@/components/_ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import FormMessage from "@/components/_common/form-message";
import { saveProduct } from "@/lib/catalog/product-actions";
import type { ProductFormInput } from "@/lib/catalog/product-form";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };
type Variant = ProductFormInput["variants"][number];

type ProductFormProps = {
  initial: ProductFormInput;
  categories: Option[];
  taxClasses: Option[];
  currency: string;
};

function emptyVariant(): Variant {
  return { name: "", sku: "", barcode: "", price: "", cost: "", track: true, active: true };
}

export default function ProductForm({ initial, categories, taxClasses, currency }: ProductFormProps) {
  const [values, setValues] = useState<ProductFormInput>(initial);
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveProduct, null);
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};

  function set<K extends keyof ProductFormInput>(key: K, value: ProductFormInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setVariant(index: number, patch: Partial<Variant>) {
    setValues((current) => ({ ...current, variants: current.variants.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)) }));
  }

  function moveVariant(index: number, direction: -1 | 1) {
    setValues((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.variants.length) return current;
      const variants = [...current.variants];
      [variants[index], variants[target]] = [variants[target], variants[index]];
      return { ...current, variants };
    });
  }

  function removeVariant(index: number) {
    setValues((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) }));
  }

  return (
    <form action={action} className="flex flex-col gap-6 p-4">
      <input type="hidden" name="payload" value={JSON.stringify(values)} />
      <FormMessage result={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" htmlFor="product-name" error={errors.name}>
          <Input id="product-name" value={values.name} onChange={(event) => set("name", event.target.value)} maxLength={120} required />
        </Field>
        <Field label="Category" htmlFor="product-category" error={errors.categoryId}>
          <Select value={values.categoryId || "none"} onValueChange={(value) => set("categoryId", value === "none" ? "" : value)}>
            <SelectTrigger id="product-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No category</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Tax class" htmlFor="product-tax" error={errors.taxClassId}>
          <Select value={values.taxClassId} onValueChange={(value) => set("taxClassId", value)}>
            <SelectTrigger id="product-tax">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {taxClasses.map((taxClass) => (
                <SelectItem key={taxClass.id} value={taxClass.id}>{taxClass.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Description" htmlFor="product-description">
          <Input id="product-description" value={values.description} onChange={(event) => set("description", event.target.value)} maxLength={500} />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="product-active" checked={values.active} onCheckedChange={(checked) => set("active", checked === true)} />
        <Label htmlFor="product-active">Active — shown at the register</Label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2>Variants</h2>
          <Button variant="secondary" size="md" onClick={() => setValues((current) => ({ ...current, variants: [...current.variants, emptyVariant()] }))}>
            Add variant
          </Button>
        </div>
        <span className="caption-style text-subtle">Prices in {currency}. Tracking applies to the store you&apos;re viewing.</span>
        {errors.variants && <span role="alert" className="caption-style text-danger">{errors.variants}</span>}
        <ul className="divide-line-strong border-line-strong divide-y rounded-lg border">
          {values.variants.map((variant, index) => {
            const label = (field: string) => `Variant ${index + 1} ${field}`;
            const error = (field: string) => errors[`variants.${index}.${field}`];
            return (
              <li key={variant.id ?? `new-${index}`} className={cn("flex flex-col gap-2 p-3", !variant.active && "opacity-60")}>
                <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_1fr_0.8fr_0.8fr]">
                  <Input aria-label={label("name")} placeholder="Default" value={variant.name} onChange={(event) => setVariant(index, { name: event.target.value })} maxLength={60} />
                  <Input aria-label={label("SKU")} aria-invalid={Boolean(error("sku"))} placeholder="SKU" value={variant.sku} onChange={(event) => setVariant(index, { sku: event.target.value })} maxLength={64} />
                  <Input aria-label={label("barcode")} aria-invalid={Boolean(error("barcode"))} placeholder="Barcode" value={variant.barcode} onChange={(event) => setVariant(index, { barcode: event.target.value })} maxLength={64} />
                  <Input aria-label={label("price")} aria-invalid={Boolean(error("price"))} placeholder="Price" inputMode="decimal" value={variant.price} onChange={(event) => setVariant(index, { price: event.target.value })} />
                  <Input aria-label={label("cost")} aria-invalid={Boolean(error("cost"))} placeholder="Cost" inputMode="decimal" value={variant.cost} onChange={(event) => setVariant(index, { cost: event.target.value })} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Checkbox id={`variant-${index}-track`} checked={variant.track} onCheckedChange={(checked) => setVariant(index, { track: checked === true })} />
                  <Label htmlFor={`variant-${index}-track`}>Track stock</Label>
                  <div className="ml-auto flex gap-1">
                    <Button variant="ghost" size="sm" aria-label={`Move variant ${index + 1} up`} disabled={index === 0} onClick={() => moveVariant(index, -1)}>↑</Button>
                    <Button variant="ghost" size="sm" aria-label={`Move variant ${index + 1} down`} disabled={index === values.variants.length - 1} onClick={() => moveVariant(index, 1)}>↓</Button>
                    {variant.id ? (
                      <Button variant="ghost" size="sm" onClick={() => setVariant(index, { active: !variant.active })}>{variant.active ? "Archive" : "Restore"}</Button>
                    ) : (
                      <Button variant="ghost" size="sm" disabled={values.variants.length === 1} onClick={() => removeVariant(index)}>Remove</Button>
                    )}
                  </div>
                </div>
                {["name", "sku", "barcode", "price", "cost"].map((field) =>
                  error(field) ? <span key={field} role="alert" className="caption-style text-danger">{error(field)}</span> : null,
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex justify-end gap-2">
        <Button href="/products" variant="ghost" size="md">Back to products</Button>
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save product" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
