"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import { RANGE_PRESETS, type RangePreset } from "@/lib/reports/range";
import type { ReportTab } from "@/lib/reports/params";

const TABS: { value: ReportTab; label: string }[] = [
  { value: "summary", label: "Summary" },
  { value: "products", label: "Products" },
  { value: "staff", label: "Staff" },
  { value: "cashups", label: "Cash-ups" },
];

type ReportsToolbarProps = { tab: ReportTab; preset: RangePreset; fromDate: string; toDate: string };

export default function ReportsToolbar({ tab, preset, fromDate, toDate }: ReportsToolbarProps) {
  const router = useRouter();
  const key = `${preset}|${fromDate}|${toDate}`;
  const [prevKey, setPrevKey] = useState(key);
  const [custom, setCustom] = useState(preset === "custom");
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);
  if (key !== prevKey) {
    setPrevKey(key);
    setCustom(preset === "custom");
    setFrom(fromDate);
    setTo(toDate);
  }

  const rangeQuery: Record<string, string> = preset === "custom" ? { range: "custom", from: fromDate, to: toDate } : { range: preset };
  const shown = custom ? "custom" : preset;

  function choose(value: string) {
    if (value === "custom") {
      setCustom(true);
      return;
    }
    setCustom(false);
    router.push(`/reports?${new URLSearchParams({ tab, range: value }).toString()}`);
  }

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`/reports?${new URLSearchParams({ tab, range: "custom", from, to }).toString()}`);
  }

  return (
    <div className="border-line-strong flex flex-wrap items-center gap-2 border-b px-4 py-3">
      <nav aria-label="Reports" className="flex flex-wrap gap-1">
        {TABS.map((entry) => (
          <Button
            key={entry.value}
            href={`/reports?${new URLSearchParams({ tab: entry.value, ...rangeQuery }).toString()}`}
            variant="ghost"
            size="md"
            aria-current={entry.value === tab ? "page" : undefined}
            className="aria-[current=page]:text-foreground aria-[current=page]:bg-white/6"
          >
            {entry.label}
          </Button>
        ))}
      </nav>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select value={shown} onValueChange={choose}>
          <SelectTrigger aria-label="Date range" className="w-auto min-w-[10em]">
            <SelectValue>{RANGE_PRESETS.find((entry) => entry.value === shown)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {RANGE_PRESETS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {custom && (
          <form onSubmit={apply} className="flex flex-wrap items-center gap-2">
            <Input type="date" aria-label="From" className="w-auto" value={from} onChange={(event) => setFrom(event.target.value)} required />
            <Input type="date" aria-label="To" className="w-auto" value={to} onChange={(event) => setTo(event.target.value)} required />
            <Button type="submit" variant="secondary" size="md">Apply</Button>
          </form>
        )}
      </div>
    </div>
  );
}
