"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import { ScrollArea } from "@/components/_ui/scroll-area";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import TicketCard from "./ticket-card";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { useNow } from "@/hooks/use-now";
import { finishTicket, recallTicket } from "@/lib/kitchen/actions";
import type { KitchenTicket } from "@/lib/kitchen/queries";

const CHIME = "pos-kitchen-chime";

function readChime(): boolean {
  try {
    return window.localStorage.getItem(CHIME) === "1";
  } catch {
    return false;
  }
}

type KitchenScreenProps = { storeId: string; storeName: string; timeZone: string; tickets: KitchenTicket[] };

export default function KitchenScreen({ storeId, storeName, timeZone, tickets }: KitchenScreenProps) {
  useLiveRefresh("kitchen_tickets", storeId);
  const now = useNow();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [chime, setChime] = useState(readChime);
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string>>(new Set(tickets.map((ticket) => ticket.id)));
  const time = (iso: string) => new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone }).format(new Date(iso));

  useEffect(() => {
    const fresh = tickets.some((ticket) => !seen.current.has(ticket.id));
    seen.current = new Set(tickets.map((ticket) => ticket.id));
    if (!fresh || !chime || !audio.current) return;
    const context = audio.current;
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.4);
    tone.connect(gain).connect(context.destination);
    tone.start();
    tone.stop(context.currentTime + 0.4);
  }, [tickets, chime]);

  function changeChime(next: boolean) {
    setChime(next);
    if (next && !audio.current) audio.current = new AudioContext();
    try {
      window.localStorage.setItem(CHIME, next ? "1" : "0");
    } catch {}
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setNotice(result.error);
      else router.refresh();
    });
  }

  return (
    <section id="kitchen" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title={`Kitchen · ${storeName}`}
        actions={
          <>
            <label className="caption-style text-soft flex min-h-11 items-center gap-2">
              <Checkbox aria-label="Chime on new ticket" checked={chime} onCheckedChange={(checked) => changeChime(checked === true)} />
              Chime
            </label>
            <Button variant="secondary" size="md" className="min-h-11" disabled={pending} onClick={() => run(recallTicket)}>Recall</Button>
          </>
        }
      />
      {notice && <span role="alert" className="caption-style text-danger px-4 pt-3">{notice}</span>}
      <ScrollArea className="min-h-0 flex-1">
        {tickets.length === 0 ? (
          <EmptyState title="No tickets" description="Tickets show up here when a server sends a tab or a counter sale has kitchen items." />
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] items-start gap-3 p-3">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="flex">
                <TicketCard ticket={ticket} now={now} time={time} pending={pending} onDone={() => run(() => finishTicket(ticket.id))} />
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </section>
  );
}
