"use client";

import { useState } from "react";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import TableTile from "./table-tile";
import OpenTabDialog, { type OpenTabTarget } from "./open-tab-dialog";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { useNow } from "@/hooks/use-now";
import { formatMoney } from "@/lib/money";
import type { AreaWithTables, FloorTab } from "@/lib/tables/queries";

type FloorProps = { storeId: string; currency: string; canSetUp: boolean; areas: AreaWithTables[]; tabs: FloorTab[] };

const GRID = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]";

export default function Floor({ storeId, currency, canSetUp, areas, tabs }: FloorProps) {
  useLiveRefresh("tabs", storeId);
  const now = useNow();
  const money = (minor: number) => formatMoney(minor, currency, "en-US");
  const [areaId, setAreaId] = useState("");
  const [target, setTarget] = useState<OpenTabTarget | null>(null);
  const byTable = new Map(tabs.filter((tab) => tab.tableId).map((tab) => [tab.tableId!, tab]));
  const barTabs = tabs.filter((tab) => !tab.tableId);
  const shown = areas.filter((area) => !areaId || area.id === areaId);

  return (
    <section id="tables" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title="Tables"
        actions={
          <>
            {canSetUp && <Button href="/tables/setup" variant="ghost" size="md">Set up tables</Button>}
            <Button variant="secondary" size="md" onClick={() => setTarget({ bar: true })}>New bar tab</Button>
          </>
        }
      />
      {areas.length > 1 && (
        <div role="group" aria-label="Areas" className="border-line-strong flex gap-1 overflow-x-auto border-b px-3 py-2">
          {[{ id: "", name: "All" }, ...areas].map((area) => (
            <Button
              key={area.id || "all"}
              variant="ghost"
              size="md"
              aria-pressed={areaId === area.id}
              className="aria-pressed:text-foreground min-h-11 shrink-0 aria-pressed:bg-white/6"
              onClick={() => setAreaId(area.id)}
            >
              {area.name}
            </Button>
          ))}
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        {areas.length === 0 && barTabs.length === 0 ? (
          <EmptyState
            title="No tables yet"
            description={canSetUp ? "Add areas and tables to start taking orders at the table. Bar tabs work without them." : "Ask a manager to set up tables. Bar tabs work without them."}
            action={canSetUp ? <Button href="/tables/setup" variant="primary" size="md">Set up tables</Button> : undefined}
          />
        ) : (
          <div className="flex flex-col gap-6 p-3">
            {shown.map((area) => (
              <section key={area.id} aria-labelledby={`area-${area.id}`} className="flex flex-col gap-2">
                <h2 id={`area-${area.id}`} className="caption-style text-soft uppercase">{area.name}</h2>
                <ul className={GRID}>
                  {area.tables.map((table) => (
                    <li key={table.id}>
                      <TableTile label={table.name} seats={table.seats} tab={byTable.get(table.id) ?? null} now={now} money={money} onOpen={() => setTarget({ tableId: table.id, tableName: table.name })} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {barTabs.length > 0 && (
              <section aria-labelledby="bar-tabs" className="flex flex-col gap-2">
                <h2 id="bar-tabs" className="caption-style text-soft uppercase">Bar tabs</h2>
                <ul className={GRID}>
                  {barTabs.map((tab) => (
                    <li key={tab.id}>
                      <TableTile label={tab.name ?? "Tab"} seats={null} tab={tab} now={now} money={money} onOpen={() => undefined} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </ScrollArea>
      <OpenTabDialog target={target} onClose={() => setTarget(null)} />
    </section>
  );
}
