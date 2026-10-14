"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import { Checkbox } from "@/components/_ui/checkbox";
import { updateStockSettings } from "@/lib/catalog/stock-actions";
import type { ActionResult } from "@/lib/action-result";

type StockSettingsFormProps = { variantId: string; variantName: string; track: boolean; lowStockAt: number | null };

export default function StockSettingsForm({ variantId, variantName, track, lowStockAt }: StockSettingsFormProps) {
  const key = `${track}|${lowStockAt ?? ""}`;
  const [prevKey, setPrevKey] = useState(key);
  const [tracked, setTracked] = useState(track);
  const [low, setLow] = useState(lowStockAt === null ? "" : String(lowStockAt));
  const [state, action, pending] = useActionState<ActionResult, FormData>(updateStockSettings, null);

  if (key !== prevKey) {
    setPrevKey(key);
    setTracked(track);
    setLow(lowStockAt === null ? "" : String(lowStockAt));
  }

  const error = state && !state.ok ? state.fieldErrors?.lowStockAt ?? state.error : undefined;

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="variantId" value={variantId} />
      <Checkbox id={`track-${variantId}`} name="track" checked={tracked} onCheckedChange={(checked) => setTracked(checked === true)} />
      <Label htmlFor={`track-${variantId}`}>Track</Label>
      <Label htmlFor={`low-${variantId}`} className="ml-2">Low at</Label>
      <Input id={`low-${variantId}`} name="lowStockAt" inputMode="numeric" className="w-20" value={low} onChange={(event) => setLow(event.target.value)} aria-label={`Low-stock level for ${variantName}`} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>Save</Button>
      {error && <span role="alert" className="caption-style text-danger">{error}</span>}
    </form>
  );
}
