import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatProps = { label: string; value: ReactNode; className?: string };

export default function Stat({ label, value, className }: StatProps) {
  return (
    <div className={cn("flex min-w-[8em] flex-col gap-1.5", className)}>
      <span className="block text-[28px] leading-none font-semibold tabular-nums">{value}</span>
      <span className="caption-style text-soft block">{label}</span>
    </div>
  );
}
