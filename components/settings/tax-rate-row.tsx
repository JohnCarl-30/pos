"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { TableCell, TableRow } from "@/components/_ui/table";
import { saveTaxRate } from "@/lib/settings/tax-actions";
import type { ActionResult } from "@/lib/action-result";

type TaxRateRowProps = {
  storeId: string;
  taxClass: { id: string; name: string; is_default: boolean };
  rate: { name: string; rate: string } | null;
};

export default function TaxRateRow({ storeId, taxClass, rate }: TaxRateRowProps) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveTaxRate, null);
  const [prevRate, setPrevRate] = useState(rate);
  const [name, setName] = useState(rate?.name ?? taxClass.name);
  const [rateValue, setRateValue] = useState(rate?.rate ?? "0");

  if (rate !== prevRate) {
    setPrevRate(rate);
    setName(rate?.name ?? taxClass.name);
    setRateValue(rate?.rate ?? "0");
  }

  const formId = `rate-${taxClass.id}`;
  const error = state && !state.ok ? (state.fieldErrors?.rate ?? state.fieldErrors?.name ?? state.error) : undefined;

  return (
    <TableRow>
      <TableCell>
        {taxClass.name}
        {taxClass.is_default && <span className="caption-style text-subtle"> · default</span>}
        <form id={formId} action={action}>
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="taxClassId" value={taxClass.id} />
        </form>
      </TableCell>
      <TableCell>
        <Input
          form={formId}
          name="name"
          aria-label={`${taxClass.name} label on receipts`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={60}
        />
      </TableCell>
      <TableCell>
        <Input
          form={formId}
          name="rate"
          aria-label={`${taxClass.name} rate in percent`}
          inputMode="decimal"
          value={rateValue}
          onChange={(event) => setRateValue(event.target.value)}
          required
          className="w-24"
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {error && <span role="alert" className="caption-style text-danger">{error}</span>}
          {state?.ok && <span role="status" className="caption-style text-success">Saved</span>}
          <Button form={formId} type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
