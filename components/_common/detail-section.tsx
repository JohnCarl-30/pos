import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DetailSectionProps = { title: string; action?: ReactNode; children: ReactNode; className?: string };

export default function DetailSection({ title, action, children, className }: DetailSectionProps) {
  return (
    <section className={cn("flex flex-col gap-4 p-5 shadow-[inset_0_-1px_0_var(--line-strong)]", className)}>
      <div className="flex min-h-[30px] items-center justify-between gap-2">
        <h2 className="eyebrow-style text-soft font-normal">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
