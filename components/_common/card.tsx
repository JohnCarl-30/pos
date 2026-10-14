import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export default function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-card rounded-lg p-4 shadow-[0px_4px_4px_0px_rgba(42,42,42,0.32),0px_0px_0px_1px_#0e0e0e,inset_0px_1px_0px_0px_rgba(255,255,255,0.08),inset_0px_0px_0px_1px_rgba(255,255,255,0.08)]",
        className,
      )}
      {...props}
    />
  );
}
