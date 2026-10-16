"use client";

import { useActionState, useState } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import Card from "@/components/_common/card";
import type { ActionResult } from "@/lib/action-result";
import { move, saveArea, saveTable, setActive } from "@/lib/tables/actions";
import type { AreaWithTables, DiningTable } from "@/lib/tables/queries";
import { cn } from "@/lib/utils";

function errorOf(...states: ActionResult[]): string | undefined {
  for (const state of states) {
    if (state && !state.ok) return state.error ?? Object.values(state.fieldErrors ?? {})[0];
  }
  return undefined;
}

function MoveButtons({ kind, id, label, first, last }: { kind: "area" | "table"; id: string; label: string; first: boolean; last: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(move, null);
  return (
    <>
      {(["-1", "1"] as const).map((direction) => (
        <form key={direction} action={action}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="direction" value={direction} />
          <Button type="submit" variant="ghost" size="sm" disabled={pending || (direction === "-1" ? first : last)} aria-label={`Move ${label} ${direction === "-1" ? "up" : "down"}`}>
            {direction === "-1" ? "↑" : "↓"}
          </Button>
        </form>
      ))}
      {state && !state.ok && <span role="alert" className="caption-style text-danger basis-full">{state.error}</span>}
    </>
  );
}

function ActiveButton({ kind, id, label, active }: { kind: "area" | "table"; id: string; label: string; active: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(setActive, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} aria-label={`${active ? "Archive" : "Restore"} ${label}`}>
        {active ? "Archive" : "Restore"}
      </Button>
      {state && !state.ok && <span role="alert" className="caption-style text-danger">{state.error}</span>}
    </form>
  );
}

function TableRow({ table, areaId, first, last }: { table: DiningTable; areaId: string; first: boolean; last: boolean }) {
  const [name, setName] = useState(table.name);
  const [seats, setSeats] = useState(String(table.seats));
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveTable, null);
  return (
    <li className={cn("flex flex-wrap items-center gap-2 py-2", !table.active && "opacity-60")}>
      <form action={action} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={table.id} />
        <input type="hidden" name="areaId" value={areaId} />
        <Input name="name" aria-label={`Name for table ${table.name}`} className="w-[8em]" value={name} maxLength={20} onChange={(event) => setName(event.target.value)} />
        <Input name="seats" aria-label={`Seats at ${table.name}`} inputMode="numeric" className="w-[5em]" value={seats} onChange={(event) => setSeats(event.target.value)} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending || (name.trim() === table.name && seats === String(table.seats))}>Save</Button>
      </form>
      <MoveButtons kind="table" id={table.id} label={table.name} first={first} last={last} />
      <ActiveButton kind="table" id={table.id} label={table.name} active={table.active} />
      {errorOf(state) && <span role="alert" className="caption-style text-danger basis-full">{errorOf(state)}</span>}
    </li>
  );
}

function AddTableForm({ area }: { area: AreaWithTables }) {
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("4");
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, formData) => {
    const result = await saveTable(prev, formData);
    if (result?.ok) setName("");
    return result;
  }, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 pt-2">
      <input type="hidden" name="areaId" value={area.id} />
      <Input name="name" aria-label={`New table name in ${area.name}`} placeholder="Table name" className="w-[8em]" value={name} maxLength={20} onChange={(event) => setName(event.target.value)} />
      <Input name="seats" aria-label={`Seats for the new table in ${area.name}`} inputMode="numeric" className="w-[5em]" value={seats} onChange={(event) => setSeats(event.target.value)} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending || name.trim() === ""}>Add table</Button>
      {errorOf(state) && <span role="alert" className="caption-style text-danger basis-full">{errorOf(state)}</span>}
    </form>
  );
}

function AreaCard({ area, first, last }: { area: AreaWithTables; first: boolean; last: boolean }) {
  const [name, setName] = useState(area.name);
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveArea, null);
  const active = area.tables.filter((table) => table.active);
  const archived = area.tables.filter((table) => !table.active);
  return (
    <Card className={cn("flex flex-col gap-3", !area.active && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <form action={action} className="flex min-w-0 flex-1 items-center gap-2">
          <input type="hidden" name="id" value={area.id} />
          <Input name="name" aria-label={`Name for area ${area.name}`} value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          <Button type="submit" variant="secondary" size="sm" disabled={pending || name.trim() === area.name}>Rename</Button>
        </form>
        <MoveButtons kind="area" id={area.id} label={area.name} first={first} last={last} />
        <ActiveButton kind="area" id={area.id} label={area.name} active={area.active} />
        {errorOf(state) && <span role="alert" className="caption-style text-danger basis-full">{errorOf(state)}</span>}
      </div>
      {area.active && (
        <>
          <ul className="divide-line-strong flex flex-col divide-y">
            {[...active, ...archived].map((table, index) => (
              <TableRow key={table.id} table={table} areaId={area.id} first={index === 0} last={index === active.length - 1 || !table.active} />
            ))}
          </ul>
          <AddTableForm area={area} />
        </>
      )}
    </Card>
  );
}

function AddAreaForm() {
  const [name, setName] = useState("");
  const [state, action, pending] = useActionState<ActionResult, FormData>(async (prev, formData) => {
    const result = await saveArea(prev, formData);
    if (result?.ok) setName("");
    return result;
  }, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Input name="name" aria-label="New area name" placeholder="Area name, like Patio" className="max-w-[20em]" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
      <Button type="submit" variant="primary" size="md" disabled={pending || name.trim() === ""}>Add area</Button>
      {errorOf(state) && <span role="alert" className="caption-style text-danger basis-full">{errorOf(state)}</span>}
    </form>
  );
}

export default function AreasEditor({ areas }: { areas: AreaWithTables[] }) {
  const active = areas.filter((area) => area.active);
  const archived = areas.filter((area) => !area.active);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-subtle">Group tables into areas, like Inside and Patio. Servers see them in this order on the Tables screen.</p>
      {[...active, ...archived].map((area, index) => (
        <AreaCard key={area.id} area={area} first={index === 0} last={index === active.length - 1 || !area.active} />
      ))}
      <AddAreaForm />
    </div>
  );
}
