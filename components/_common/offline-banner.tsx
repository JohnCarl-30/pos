"use client";

import { useOnline } from "@/hooks/use-online";

export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="caption-style bg-warning/15 text-warning shrink-0 px-4 py-2">
      You&apos;re offline. Sales are paused until the connection comes back.
    </div>
  );
}
