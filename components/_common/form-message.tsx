import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

export default function FormMessage({ result }: { result: ActionResult }) {
  if (!result) return null;
  const text = result.ok ? result.message : result.error;
  if (!text) return null;
  return (
    <div
      role={result.ok ? "status" : "alert"}
      className={cn("caption-style rounded-lg px-3 py-2", result.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}
    >
      {text}
    </div>
  );
}
